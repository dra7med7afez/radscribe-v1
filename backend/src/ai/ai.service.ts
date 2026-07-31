import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../prisma/prisma.service";
import {
  DocumentEditResult,
  DocumentTreeNode,
  GeminiService,
  SectionDescriptor,
  StructuredResult,
} from "./gemini.service";
import {
  TranscribeDto,
  StructureDto,
  StructureDocumentDto,
  ImpressionDto,
  SelectedTextEditDto,
} from "./dto";
import { unexpectedMedicalChanges } from "./medical-edit-safety";

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  constructor(
    private config: ConfigService,
    private prisma: PrismaService,
    private gemini: GeminiService
  ) {}

  private get useGemini(): boolean {
    return this.config.get<string>("ai.provider") === "gemini" && this.gemini.hasKey();
  }

  // Normalize the client's dynamic section list into the descriptor the Gemini
  // structuring prompt consumes (findings + subpoints carry their stable ids so
  // dictation can update an existing bullet or parameter in place).
  private mapSections(raw?: any[]): SectionDescriptor[] {
    return (raw || []).map((s) => ({
      id: s.id,
      name: s.name,
      kind: s.kind === "prose" ? "prose" : "findings",
      grouped: !!s.grouped,
      text: typeof s.text === "string" ? s.text : "",
      regions: s.regions || [],
      findings: Array.isArray(s.findings) ? s.findings : [],
      subpoints: Array.isArray(s.subpoints) ? s.subpoints : [],
    }));
  }

  // Keep the whole tree while bounding its size and retaining only the fields
  // the router needs. This makes token use predictable and treats editor text
  // as untrusted data, not prompt instructions.
  private mapDocument(raw: unknown): DocumentTreeNode | null {
    const limits = { nodes: 0, text: 0 };
    const visit = (value: unknown, depth: number): DocumentTreeNode | null => {
      if (!value || typeof value !== "object" || Array.isArray(value) || depth > 20) return null;
      if (++limits.nodes > 5000) return null;
      const node = value as Record<string, unknown>;
      const type = typeof node.type === "string" ? node.type.slice(0, 32) : "";
      if (!type) return null;
      const output: DocumentTreeNode = { type };
      if (typeof node.id === "string" && node.id.length <= 100) output.id = node.id;
      if (typeof node.text === "string") {
        const remaining = 200_000 - limits.text;
        if (remaining <= 0) return null;
        output.text = node.text.slice(0, remaining);
        limits.text += output.text.length;
      }
      if (Array.isArray(node.marks)) {
        output.marks = node.marks
          .filter((mark): mark is string => typeof mark === "string")
          .slice(0, 10)
          .map((mark) => mark.slice(0, 32));
      }
      if (node.attrs && typeof node.attrs === "object" && !Array.isArray(node.attrs)) {
        const attrs = node.attrs as Record<string, unknown>;
        const safeAttrs: Record<string, string | number | boolean | null> = {};
        for (const key of ["level", "textAlign", "start", "listStyle", "inserted"]) {
          const item = attrs[key];
          if (
            item === null ||
            typeof item === "string" ||
            typeof item === "number" ||
            typeof item === "boolean"
          ) safeAttrs[key] = item;
        }
        if (Object.keys(safeAttrs).length) output.attrs = safeAttrs;
      }
      if (Array.isArray(node.children)) {
        output.children = [];
        for (const child of node.children) {
          const mapped = visit(child, depth + 1);
          if (!mapped) return null;
          output.children.push(mapped);
        }
      }
      return output;
    };
    return visit(raw, 0);
  }

  private async meter(
    task: any,
    status: any,
    latencyMs: number,
    userId?: string,
    usage?: { promptTokens: number; outputTokens: number },
    reportId?: string
  ) {
    try {
      await this.prisma.aiUsage.create({
        data: {
          userId: userId ?? null,
          task,
          model: this.config.get<string>("ai.geminiModel") || "mock",
          status,
          latencyMs,
          promptTokens: usage?.promptTokens ?? 0,
          outputTokens: usage?.outputTokens ?? 0,
          reportId: reportId ?? null,
          provider: this.useGemini ? "gemini" : "mock",
        },
      });
    } catch {
      /* metering best-effort */
    }
  }

  async transcribe(dto: TranscribeDto, userId?: string): Promise<{ text: string }> {
    const start = Date.now();
    const audio = Buffer.from(dto.audioBase64, "base64");
    if (
      audio.length < 44 ||
      audio.toString("ascii", 0, 4) !== "RIFF" ||
      audio.toString("ascii", 8, 12) !== "WAVE"
    ) {
      throw new BadRequestException("Audio must be a valid PCM WAV recording");
    }
    const byteRate = audio.readUInt32LE(28);
    const dataBytes = Math.max(0, audio.length - 44);
    if (!byteRate || dataBytes / byteRate > 10 * 60) {
      throw new BadRequestException("Audio recording exceeds the 10 minute limit");
    }
    // REAL Gemini transcription only — no silent empty-string fallback.
    if (!this.useGemini) {
      await this.meter("TRANSCRIBE", "ERROR", Date.now() - start, userId, undefined, dto.reportId);
      throw new ServiceUnavailableException("AI is not configured (missing Gemini API key).");
    }
    try {
      const text = await this.gemini.transcribe(dto.audioBase64, dto.mimeType);
      await this.meter("TRANSCRIBE", "SUCCESS", Date.now() - start, userId, this.gemini.lastUsage, dto.reportId);
      return { text };
    } catch (err) {
      this.logger.error(`transcribe failed: ${(err as Error).message}`);
      await this.meter("TRANSCRIBE", "ERROR", Date.now() - start, userId, undefined, dto.reportId);
      throw new ServiceUnavailableException(
        `Transcription failed: ${(err as Error).message}`.slice(0, 200)
      );
    }
  }

  // This endpoint deliberately takes only a selected fragment. It never enters
  // the dictation→structure pipeline and rejects an LLM rewrite that changes a
  // protected clinical fact without that fact being explicitly requested.
  async editSelection(dto: SelectedTextEditDto, userId?: string): Promise<{ text: string }> {
    const start = Date.now();
    if (!this.useGemini) {
      await this.meter("REWRITE", "ERROR", Date.now() - start, userId, undefined, dto.reportId);
      throw new ServiceUnavailableException("AI is not configured (missing Gemini API key).");
    }
    try {
      const text = await this.gemini.editSelection(dto.selectedText, dto.instruction, dto.action);
      const unexpected = unexpectedMedicalChanges(dto.selectedText, text, dto.instruction);
      if (unexpected.length) {
        await this.meter("REWRITE", "ERROR", Date.now() - start, userId, this.gemini.lastUsage, dto.reportId);
        throw new UnprocessableEntityException(
          `Edit rejected because it changed ${unexpected.join(", ")} without an explicit instruction.`
        );
      }
      await this.meter("REWRITE", "SUCCESS", Date.now() - start, userId, this.gemini.lastUsage, dto.reportId);
      return { text };
    } catch (err) {
      if (err instanceof UnprocessableEntityException) throw err;
      this.logger.error(`selected-text edit failed: ${(err as Error).message}`);
      await this.meter("REWRITE", "ERROR", Date.now() - start, userId, undefined, dto.reportId);
      throw new ServiceUnavailableException(
        `Selected-text edit failed: ${(err as Error).message}`.slice(0, 200)
      );
    }
  }

  // Impression from the WHOLE report — called once when the radiologist
  // finishes dictating findings, so the conclusion synthesizes the full case.
  async impression(dto: ImpressionDto, userId?: string): Promise<{ lines: string[] }> {
    const start = Date.now();
    if (!this.useGemini) {
      await this.meter("IMPRESSION", "ERROR", Date.now() - start, userId, undefined, dto.reportId);
      throw new ServiceUnavailableException("AI is not configured (missing Gemini API key).");
    }
    try {
      const lines = await this.gemini.generateImpression(dto.report);
      await this.meter("IMPRESSION", "SUCCESS", Date.now() - start, userId, this.gemini.lastUsage, dto.reportId);
      return { lines };
    } catch (err) {
      this.logger.error(`impression failed: ${(err as Error).message}`);
      await this.meter("IMPRESSION", "ERROR", Date.now() - start, userId, undefined, dto.reportId);
      throw new ServiceUnavailableException(
        `Impression generation failed: ${(err as Error).message}`.slice(0, 200)
      );
    }
  }

  async structure(
    dto: StructureDto,
    userId?: string
  ): Promise<{ results: StructuredResult[]; mode: string; model: string }> {
    const start = Date.now();
    // "academic"/"personal" (removed presets) from stale clients fold into "concise"
    let mode = (dto.mode || "CONCISE").toLowerCase();
    if (mode === "academic" || mode === "personal") mode = "concise";
    const sections = this.mapSections(dto.sections);

    const model = this.config.get<string>("ai.geminiModel") || "gemini-3.1-flash-lite";

    // REAL Gemini structuring only — no demo/heuristic fallback.
    if (!this.useGemini) {
      await this.meter("STRUCTURE", "ERROR", Date.now() - start, userId, undefined, dto.reportId);
      throw new ServiceUnavailableException("AI is not configured (missing Gemini API key).");
    }
    if (!sections.length) return { results: [], mode, model };

    try {
      const results = await this.gemini.structure(
        dto.transcript,
        mode,
        sections,
        dto.structuringInstructions?.trim() || ""
      );
      await this.meter("STRUCTURE", "SUCCESS", Date.now() - start, userId, this.gemini.lastUsage, dto.reportId);
      return { results, mode, model };
    } catch (err) {
      this.logger.error(`Gemini structure failed: ${(err as Error).message}`);
      await this.meter("STRUCTURE", "ERROR", Date.now() - start, userId, undefined, dto.reportId);
      throw new ServiceUnavailableException(
        `Structuring failed: ${(err as Error).message}`.slice(0, 200)
      );
    }
  }

  async structureDocument(
    dto: StructureDocumentDto,
    userId?: string
  ): Promise<{ results: DocumentEditResult[]; mode: string; model: string }> {
    const start = Date.now();
    let mode = (dto.mode || "CONCISE").toLowerCase();
    if (mode !== "verbatim") mode = "concise";
    const document = this.mapDocument(dto.document);
    const model = this.config.get<string>("ai.geminiModel") || "gemini-3.1-flash-lite";

    if (!this.useGemini) {
      await this.meter("STRUCTURE", "ERROR", Date.now() - start, userId, undefined, dto.reportId);
      throw new ServiceUnavailableException("AI is not configured (missing Gemini API key).");
    }
    if (!document) {
      throw new UnprocessableEntityException("Document tree is invalid or exceeds the safe limit.");
    }

    try {
      const results = await this.gemini.structureDocument(
        dto.transcript,
        mode,
        document,
        dto.structuringInstructions?.trim() || ""
      );
      await this.meter("STRUCTURE", "SUCCESS", Date.now() - start, userId, this.gemini.lastUsage, dto.reportId);
      return { results, mode, model };
    } catch (err) {
      this.logger.error(`Gemini document structure failed: ${(err as Error).message}`);
      await this.meter("STRUCTURE", "ERROR", Date.now() - start, userId, undefined, dto.reportId);
      throw new ServiceUnavailableException(
        `Structuring failed: ${(err as Error).message}`.slice(0, 200)
      );
    }
  }
}
