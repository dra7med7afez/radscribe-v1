import { ServiceUnavailableException, UnprocessableEntityException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AiService } from "./ai.service";
import { GeminiService } from "./gemini.service";
import { PrismaService } from "../prisma/prisma.service";

// The no-fake-fallback contract: when Gemini is unconfigured or failing, the
// AI endpoints must THROW (surface an error in the UI), never fabricate output.

function makeService(opts: { hasKey: boolean; gemini?: Partial<GeminiService> }) {
  const config = {
    get: (key: string) =>
      ({
        "ai.provider": "gemini",
        "ai.geminiApiKey": opts.hasKey ? "k" : "",
        "ai.geminiModel": "gemini-test",
      })[key] || "",
  } as unknown as ConfigService;
  const prisma = {
    aiUsage: { create: jest.fn().mockResolvedValue({}) },
  } as unknown as PrismaService;
  const gemini = {
    hasKey: () => opts.hasKey,
    transcribe: jest.fn(),
    structure: jest.fn(),
    structureDocument: jest.fn(),
    ...opts.gemini,
  } as unknown as GeminiService;
  return { svc: new AiService(config, prisma, gemini), prisma, gemini };
}

const SECTIONS = [
  {
    id: "sec-f",
    name: "Findings",
    kind: "findings",
    grouped: true,
    findings: [{ findingId: "i1", region: "Liver", text: "", abnormal: false }],
    subpoints: [],
  },
];

const WAV_BASE64 = (() => {
  const wav = Buffer.alloc(44);
  wav.write("RIFF", 0, "ascii");
  wav.write("WAVE", 8, "ascii");
  wav.writeUInt32LE(32_000, 28);
  return wav.toString("base64");
})();

describe("AiService — no fake fallback", () => {
  it("transcribe throws ServiceUnavailable without a key", async () => {
    const { svc } = makeService({ hasKey: false });
    await expect(svc.transcribe({ audioBase64: WAV_BASE64, mimeType: "audio/wav" } as any)).rejects.toThrow(
      ServiceUnavailableException
    );
  });

  it("transcribe throws (not empty string) when Gemini fails", async () => {
    const { svc } = makeService({
      hasKey: true,
      gemini: { transcribe: jest.fn().mockRejectedValue(new Error("Gemini 500")) as any },
    });
    await expect(svc.transcribe({ audioBase64: WAV_BASE64, mimeType: "audio/wav" } as any)).rejects.toThrow(
      ServiceUnavailableException
    );
  });

  it("structure throws ServiceUnavailable without a key", async () => {
    const { svc } = makeService({ hasKey: false });
    await expect(
      svc.structure({ transcript: "liver lesion", mode: "CONCISE", sections: SECTIONS } as any)
    ).rejects.toThrow(ServiceUnavailableException);
  });

  it("structure returns empty results only when there are no sections", async () => {
    const { svc, gemini } = makeService({ hasKey: true });
    const out = await svc.structure({ transcript: "x", mode: "CONCISE", sections: [] } as any);
    expect(out.results).toEqual([]);
    expect((gemini.structure as jest.Mock)).not.toHaveBeenCalled();
  });

  it("meters usage with the caller's user id", async () => {
    const { svc, prisma, gemini } = makeService({ hasKey: true });
    (gemini.structure as jest.Mock).mockResolvedValue([]);
    await svc.structure(
      { transcript: "x", mode: "CONCISE", sections: SECTIONS } as any,
      "user-42"
    );
    expect((prisma.aiUsage.create as jest.Mock).mock.calls[0][0].data).toMatchObject({
      userId: "user-42",
      task: "STRUCTURE",
      status: "SUCCESS",
    });
  });

  it("normalizes the client section list before structuring (mapSections)", async () => {
    const { svc, gemini } = makeService({ hasKey: true });
    (gemini.structure as jest.Mock).mockResolvedValue([]);
    await svc.structure({
      transcript: "x",
      mode: "CONCISE",
      sections: [{ id: "s1", name: "Findings", kind: "findings", grouped: 1, findings: null }],
    } as any);
    const passed = (gemini.structure as jest.Mock).mock.calls[0][2];
    expect(passed[0]).toMatchObject({ id: "s1", kind: "findings", grouped: true, findings: [], subpoints: [] });
  });

  it("sanitizes and forwards the complete document tree without derived section mapping", async () => {
    const { svc, gemini } = makeService({ hasKey: true });
    (gemini.structureDocument as jest.Mock).mockResolvedValue([]);
    const document = {
      type: "doc",
      children: [
        {
          id: "h1",
          type: "heading",
          attrs: { level: 2, unsafe: "drop-me" },
          children: [{ type: "text", text: "FINDINGS", hostile: "drop-me" }],
        },
        { id: "p1", type: "paragraph", children: [{ type: "text", text: "Clear lungs." }] },
      ],
    };

    await svc.structureDocument({ transcript: "nodule", mode: "CONCISE", document } as any);

    expect((gemini.structureDocument as jest.Mock).mock.calls[0]).toEqual([
      "nodule",
      "concise",
      {
        type: "doc",
        children: [
          {
            id: "h1",
            type: "heading",
            attrs: { level: 2 },
            children: [{ type: "text", text: "FINDINGS" }],
          },
          { id: "p1", type: "paragraph", children: [{ type: "text", text: "Clear lungs." }] },
        ],
      },
      "",
    ]);
  });

  it("trims and forwards text structuring instructions only to structuring", async () => {
    const { svc, gemini } = makeService({ hasKey: true });
    (gemini.structureDocument as jest.Mock).mockResolvedValue([]);

    await svc.structureDocument({
      transcript: "nodule",
      mode: "CONCISE",
      document: { type: "doc", children: [] },
      structuringInstructions: "  Put measurements after the finding.  ",
    } as any);

    expect((gemini.structureDocument as jest.Mock).mock.calls[0][3]).toBe(
      "Put measurements after the finding."
    );
  });

  it("rejects an unrequested protected clinical change in a selected-text edit", async () => {
    const { svc } = makeService({
      hasKey: true,
      gemini: { editSelection: jest.fn().mockResolvedValue("A 3 cm left renal lesion.") as any },
    });
    await expect(
      svc.editSelection(
        {
          selectedText: "A 2 cm right renal lesion.",
          instruction: "Make this more concise.",
          action: "concise",
        } as any
      )
    ).rejects.toThrow(UnprocessableEntityException);
  });
});
