import type { Template } from "@/types";

// ============================================================
// Seed templates (§15). Each is defined entirely by its
// `sections: TemplateSection[]` — demonstrating the variety the
// app supports: different section NAMES, different counts,
// grouped vs flat findings. No fixed skeleton.
// ============================================================

const TEMPLATE_CATALOG: Template[] = [
  // ---- CT Chest: Technique → Findings(grouped) → Impression(isConclusion)
  {
    id: "ct-chest",
    name: "CT Chest without contrast",
    modality: "CT",
    bodyPart: "Chest",
    sections: [
      {
        id: "ct-chest-technique-0",
        name: "Technique",
        kind: "prose",
        grouped: false,
        defaultProse:
          "<p>Helical CT of the chest was performed without intravenous contrast. Images were reconstructed in axial, coronal, and sagittal planes.</p>",
      },
      {
        id: "ct-chest-findings-1",
        name: "Findings",
        kind: "findings",
        grouped: true,
        findings: [
          { region: "Lungs and Airways", normalText: "The lungs are clear without consolidation, mass, or suspicious nodule. The airways are patent." },
          { region: "Pleura", normalText: "No pleural effusion or pneumothorax." },
          { region: "Mediastinum", normalText: "No mediastinal or hilar lymphadenopathy. No pericardial effusion." },
          { region: "Heart and Vessels", normalText: "Heart size is normal. The thoracic aorta is normal in caliber." },
          { region: "Bones and Soft Tissues", normalText: "No aggressive osseous lesion. The visualized soft tissues are unremarkable." },
          { region: "Upper Abdomen", normalText: "The visualized upper abdomen is unremarkable." },
        ],
      },
      {
        id: "ct-chest-impression-2",
        name: "Impression",
        kind: "prose",
        grouped: false,
        isConclusion: true,
        normalImpression: "No acute cardiopulmonary process.",
        defaultProse: "<p>No acute cardiopulmonary process.</p>",
      },
    ],
  },

  // ---- CT Abdomen: Examination → Findings(grouped) → Conclusion(isConclusion)
  {
    id: "ct-abdomen",
    name: "CT Abdomen & Pelvis with contrast",
    modality: "CT",
    bodyPart: "Abdomen & Pelvis",
    sections: [
      {
        id: "ct-abdomen-examination-0",
        name: "Examination",
        kind: "prose",
        grouped: false,
        defaultProse:
          "<p>Contrast-enhanced CT of the abdomen and pelvis was performed in the portal venous phase following administration of intravenous and oral contrast.</p>",
      },
      {
        id: "ct-abdomen-findings-1",
        name: "Findings",
        kind: "findings",
        grouped: true,
        findings: [
          { region: "Liver", normalText: "The liver is normal in size and attenuation without focal lesion." },
          { region: "Gallbladder and Biliary", normalText: "The gallbladder is unremarkable. No biliary ductal dilatation." },
          { region: "Pancreas", normalText: "The pancreas enhances homogeneously without mass or ductal dilatation." },
          { region: "Spleen", normalText: "The spleen is normal in size without focal lesion." },
          { region: "Adrenals", normalText: "The adrenal glands are normal." },
          { region: "Kidneys and Ureters", normalText: "The kidneys enhance and excrete symmetrically. No hydronephrosis or calculus." },
          { region: "Bowel", normalText: "No bowel obstruction or wall thickening. The appendix is normal." },
          { region: "Upper Abdomen", normalText: "No free air or free fluid. No lymphadenopathy." },
        ],
      },
      {
        id: "ct-abdomen-conclusion-2",
        name: "Conclusion",
        kind: "prose",
        grouped: false,
        isConclusion: true,
        normalImpression: "No acute abdominal or pelvic abnormality.",
        defaultProse: "<p>No acute abdominal or pelvic abnormality.</p>",
      },
    ],
  },

  // ---- Chest X-Ray: Technique → Findings(grouped) → Opinion(isConclusion)
  {
    id: "xr-chest",
    name: "Chest X-Ray (PA and Lateral)",
    modality: "XR",
    bodyPart: "Chest",
    sections: [
      {
        id: "xr-chest-technique-0",
        name: "Technique",
        kind: "prose",
        grouped: false,
        defaultProse: "<p>PA and lateral views of the chest were obtained.</p>",
      },
      {
        id: "xr-chest-findings-1",
        name: "Findings",
        kind: "findings",
        grouped: true,
        findings: [
          { region: "Lungs", normalText: "The lungs are clear without focal consolidation, effusion, or pneumothorax." },
          { region: "Heart and Mediastinum", normalText: "The cardiomediastinal silhouette is within normal limits." },
          { region: "Bones and Soft Tissues", normalText: "No acute osseous abnormality." },
        ],
      },
      {
        id: "xr-chest-opinion-2",
        name: "Opinion",
        kind: "prose",
        grouped: false,
        isConclusion: true,
        normalImpression: "No acute cardiopulmonary abnormality.",
        defaultProse: "<p>No acute cardiopulmonary abnormality.</p>",
      },
    ],
  },

  // ---- MRI Brain: TWO sections — Findings(grouped) → Impression(prose)
  {
    id: "mri-brain",
    name: "MRI Brain without contrast",
    modality: "MRI",
    bodyPart: "Brain",
    sections: [
      {
        id: "mri-brain-findings-0",
        name: "Findings",
        kind: "findings",
        grouped: true,
        findings: [
          { region: "Parenchyma", normalText: "No acute infarct, hemorrhage, mass, or abnormal enhancement. Normal gray-white differentiation." },
          { region: "Ventricles and CSF Spaces", normalText: "The ventricles and sulci are normal in size and configuration." },
          { region: "Vascular", normalText: "Normal flow voids in the major intracranial vessels." },
          { region: "Sella and Orbits", normalText: "The sella, orbits, and skull base are unremarkable." },
          { region: "Paranasal Sinuses and Mastoids", normalText: "The visualized paranasal sinuses and mastoid air cells are clear." },
        ],
      },
      {
        id: "mri-brain-impression-1",
        name: "Impression",
        kind: "prose",
        grouped: false,
        defaultProse: "<p>Normal MRI of the brain.</p>",
      },
    ],
  },

  // ---- Portable CXR: Technique → Findings(FLAT / grouped:false)
  {
    id: "xr-portable",
    name: "Portable Chest X-Ray (bulleted)",
    modality: "XR",
    bodyPart: "Chest",
    sections: [
      {
        id: "xr-portable-technique-0",
        name: "Technique",
        kind: "prose",
        grouped: false,
        defaultProse: "<p>Single portable AP view of the chest.</p>",
      },
      {
        id: "xr-portable-findings-1",
        name: "Findings",
        kind: "findings",
        grouped: false, // FLAT — region '' ⇒ headingless bullet list
        findings: [
          { region: "", normalText: "Support lines and tubes, where present, are in standard position." },
          { region: "", normalText: "The lungs are clear without focal consolidation or effusion." },
          { region: "", normalText: "The cardiomediastinal silhouette is unremarkable." },
          { region: "", normalText: "No pneumothorax." },
        ],
      },
    ],
  },

  // ============================================================
  // 20 additional templates — all modalities, subpoints where useful
  // ============================================================

  // 1) Echocardiogram (TTE) — parameters as subpoints
  {
    id: "echo-tte",
    name: "Transthoracic Echocardiogram",
    modality: "Echo",
    bodyPart: "Heart",
    sections: [
      { id: "echo-tte-technique-0", name: "Technique", kind: "prose", grouped: false, defaultProse: "<p>Complete 2D, M-mode, color, and spectral Doppler transthoracic echocardiogram performed.</p>" },
      {
        id: "echo-tte-findings-1", name: "Findings", kind: "findings", grouped: true,
        findings: [
          { region: "Left Ventricle", normalText: "Normal LV size and systolic function. No regional wall motion abnormality.", subpoints: ["Ejection fraction: 60–65%", "Wall motion: Normal", "Wall thickness: Normal", "LV internal diameter (diastole): Normal", "Diastolic function: Normal"] },
          { region: "Right Ventricle", normalText: "Normal RV size and systolic function.", subpoints: ["TAPSE: Normal", "RV systolic pressure: Normal"] },
          { region: "Atria", normalText: "Normal left and right atrial size." },
          { region: "Valves", normalText: "Valves are structurally normal.", subpoints: ["Mitral valve: No stenosis or regurgitation", "Aortic valve: Trileaflet, no stenosis or regurgitation", "Tricuspid valve: Trace physiologic regurgitation", "Pulmonic valve: Normal"] },
          { region: "Pericardium", normalText: "No pericardial effusion." },
          { region: "Great Vessels", normalText: "Normal aortic root and ascending aorta. Normal IVC with respiratory variation." },
        ],
      },
      { id: "echo-tte-conclusion-2", name: "Conclusion", kind: "prose", grouped: false, isConclusion: true, normalImpression: "Normal transthoracic echocardiogram with preserved biventricular function.", defaultProse: "<p>Normal transthoracic echocardiogram with preserved biventricular function.</p>" },
    ],
  },

  // 2) CT Head without contrast
  {
    id: "ct-head",
    name: "CT Head without contrast",
    modality: "CT",
    bodyPart: "Head",
    sections: [
      { id: "ct-head-technique-0", name: "Technique", kind: "prose", grouped: false, defaultProse: "<p>Non-contrast axial CT of the head was performed.</p>" },
      {
        id: "ct-head-findings-1", name: "Findings", kind: "findings", grouped: true,
        findings: [
          { region: "Brain Parenchyma", normalText: "No acute infarct, hemorrhage, mass, or mass effect. Normal gray-white differentiation." },
          { region: "Ventricles and CSF Spaces", normalText: "Ventricles and sulci are normal in size for age. No midline shift." },
          { region: "Extra-axial Spaces", normalText: "No extra-axial collection." },
          { region: "Vascular", normalText: "No hyperdense vessel sign. Normal basal cisterns." },
          { region: "Calvarium and Skull Base", normalText: "No fracture or aggressive osseous lesion." },
          { region: "Paranasal Sinuses and Mastoids", normalText: "The visualized paranasal sinuses and mastoid air cells are clear." },
        ],
      },
      { id: "ct-head-impression-2", name: "Impression", kind: "prose", grouped: false, isConclusion: true, normalImpression: "No acute intracranial abnormality.", defaultProse: "<p>No acute intracranial abnormality.</p>" },
    ],
  },

  // 3) CT Pulmonary Angiogram (PE protocol)
  {
    id: "ct-pe",
    name: "CT Pulmonary Angiogram",
    modality: "CT",
    bodyPart: "Chest",
    sections: [
      { id: "ct-pe-technique-0", name: "Technique", kind: "prose", grouped: false, defaultProse: "<p>CT pulmonary angiography performed following intravenous contrast bolus, PE protocol.</p>" },
      {
        id: "ct-pe-findings-1", name: "Findings", kind: "findings", grouped: true,
        findings: [
          { region: "Pulmonary Arteries", normalText: "No filling defect to indicate pulmonary embolism. The main pulmonary artery is normal in caliber." },
          { region: "Lungs and Airways", normalText: "No consolidation, nodule, or infarct. Airways are patent." },
          { region: "Pleura", normalText: "No pleural effusion." },
          { region: "Heart and Mediastinum", normalText: "Normal heart size. No right heart strain. No lymphadenopathy." },
          { region: "Bones and Soft Tissues", normalText: "No acute osseous abnormality." },
        ],
      },
      { id: "ct-pe-impression-2", name: "Impression", kind: "prose", grouped: false, isConclusion: true, normalImpression: "No pulmonary embolism.", defaultProse: "<p>No pulmonary embolism.</p>" },
    ],
  },

  // 4) CT Cervical Spine
  {
    id: "ct-cspine",
    name: "CT Cervical Spine without contrast",
    modality: "CT",
    bodyPart: "Cervical Spine",
    sections: [
      { id: "ct-cspine-technique-0", name: "Technique", kind: "prose", grouped: false, defaultProse: "<p>Helical CT of the cervical spine with multiplanar reconstructions.</p>" },
      {
        id: "ct-cspine-findings-1", name: "Findings", kind: "findings", grouped: true,
        findings: [
          { region: "Alignment", normalText: "Normal cervical lordosis and alignment. No subluxation." },
          { region: "Vertebral Bodies", normalText: "Vertebral body heights are maintained. No fracture." },
          { region: "Discs and Facets", normalText: "No significant disc space narrowing. Facet joints are intact." },
          { region: "Spinal Canal", normalText: "No significant central canal or neural foraminal stenosis." },
          { region: "Prevertebral Soft Tissues", normalText: "Normal prevertebral soft tissues." },
        ],
      },
      { id: "ct-cspine-impression-2", name: "Impression", kind: "prose", grouped: false, isConclusion: true, normalImpression: "No acute fracture or malalignment.", defaultProse: "<p>No acute fracture or malalignment.</p>" },
    ],
  },

  // 5) MRI Lumbar Spine — per-level disc subpoints
  {
    id: "mri-lspine",
    name: "MRI Lumbar Spine without contrast",
    modality: "MRI",
    bodyPart: "Lumbar Spine",
    sections: [
      { id: "mri-lspine-technique-0", name: "Technique", kind: "prose", grouped: false, defaultProse: "<p>Multiplanar multisequence MRI of the lumbar spine without contrast.</p>" },
      {
        id: "mri-lspine-findings-1", name: "Findings", kind: "findings", grouped: true,
        findings: [
          { region: "Alignment and Bones", normalText: "Normal lumbar lordosis and vertebral alignment. Normal vertebral body heights and marrow signal." },
          { region: "Conus and Cord", normalText: "The conus medullaris terminates at a normal level with normal signal." },
          { region: "Intervertebral Levels", normalText: "No disc herniation, central canal, or foraminal stenosis at the imaged levels.", subpoints: ["L1–L2: Normal", "L2–L3: Normal", "L3–L4: Normal", "L4–L5: Normal", "L5–S1: Normal"] },
          { region: "Paraspinal Soft Tissues", normalText: "Normal paraspinal soft tissues." },
        ],
      },
      { id: "mri-lspine-impression-2", name: "Impression", kind: "prose", grouped: false, isConclusion: true, normalImpression: "No significant disc herniation or spinal stenosis.", defaultProse: "<p>No significant disc herniation or spinal stenosis.</p>" },
    ],
  },

  // 6) MRI Knee
  {
    id: "mri-knee",
    name: "MRI Knee without contrast",
    modality: "MRI",
    bodyPart: "Knee",
    sections: [
      { id: "mri-knee-technique-0", name: "Technique", kind: "prose", grouped: false, defaultProse: "<p>Multiplanar multisequence MRI of the knee without contrast.</p>" },
      {
        id: "mri-knee-findings-1", name: "Findings", kind: "findings", grouped: true,
        findings: [
          { region: "Menisci", normalText: "The medial and lateral menisci are intact without tear." },
          { region: "Cruciate Ligaments", normalText: "The ACL and PCL are intact." },
          { region: "Collateral Ligaments", normalText: "The MCL and LCL are intact." },
          { region: "Articular Cartilage", normalText: "No focal full-thickness cartilage defect." },
          { region: "Extensor Mechanism", normalText: "Normal quadriceps and patellar tendons." },
          { region: "Bones and Marrow", normalText: "No fracture or marrow edema." },
          { region: "Joint and Soft Tissues", normalText: "No significant joint effusion or Baker cyst." },
        ],
      },
      { id: "mri-knee-impression-2", name: "Impression", kind: "prose", grouped: false, isConclusion: true, normalImpression: "Normal MRI of the knee.", defaultProse: "<p>Normal MRI of the knee.</p>" },
    ],
  },

  // 7) MRI Cervical Spine
  {
    id: "mri-cspine",
    name: "MRI Cervical Spine without contrast",
    modality: "MRI",
    bodyPart: "Cervical Spine",
    sections: [
      { id: "mri-cspine-technique-0", name: "Technique", kind: "prose", grouped: false, defaultProse: "<p>Multiplanar multisequence MRI of the cervical spine without contrast.</p>" },
      {
        id: "mri-cspine-findings-1", name: "Findings", kind: "findings", grouped: true,
        findings: [
          { region: "Alignment and Bones", normalText: "Normal cervical alignment, vertebral heights, and marrow signal." },
          { region: "Spinal Cord", normalText: "Normal cord caliber and signal without myelomalacia." },
          { region: "Intervertebral Levels", normalText: "No disc herniation or significant canal or foraminal stenosis.", subpoints: ["C2–C3: Normal", "C3–C4: Normal", "C4–C5: Normal", "C5–C6: Normal", "C6–C7: Normal", "C7–T1: Normal"] },
        ],
      },
      { id: "mri-cspine-impression-2", name: "Impression", kind: "prose", grouped: false, isConclusion: true, normalImpression: "No cord compression or significant stenosis.", defaultProse: "<p>No cord compression or significant stenosis.</p>" },
    ],
  },

  // 8) MRI Brain with and without contrast
  {
    id: "mri-brain-contrast",
    name: "MRI Brain with and without contrast",
    modality: "MRI",
    bodyPart: "Brain",
    sections: [
      { id: "mri-brain-c-technique-0", name: "Technique", kind: "prose", grouped: false, defaultProse: "<p>Multiplanar multisequence MRI of the brain before and after gadolinium.</p>" },
      {
        id: "mri-brain-c-findings-1", name: "Findings", kind: "findings", grouped: true,
        findings: [
          { region: "Parenchyma", normalText: "No acute infarct, mass, or abnormal enhancement. Normal gray-white differentiation." },
          { region: "Enhancement", normalText: "No abnormal parenchymal or leptomeningeal enhancement." },
          { region: "Ventricles and CSF Spaces", normalText: "Normal ventricles and sulci." },
          { region: "Vascular", normalText: "Normal major intracranial flow voids." },
          { region: "Sella, Orbits, and Sinuses", normalText: "Unremarkable sella, orbits, and clear paranasal sinuses." },
        ],
      },
      { id: "mri-brain-c-impression-2", name: "Impression", kind: "prose", grouped: false, isConclusion: true, normalImpression: "No abnormal enhancement or acute intracranial abnormality.", defaultProse: "<p>No abnormal enhancement or acute intracranial abnormality.</p>" },
    ],
  },

  // 9) Ultrasound Abdomen (Complete) — measurements as subpoints
  {
    id: "us-abdomen",
    name: "Ultrasound Abdomen Complete",
    modality: "US",
    bodyPart: "Abdomen",
    sections: [
      { id: "us-abdomen-technique-0", name: "Technique", kind: "prose", grouped: false, defaultProse: "<p>Real-time grayscale and color Doppler ultrasound of the abdomen.</p>" },
      {
        id: "us-abdomen-findings-1", name: "Findings", kind: "findings", grouped: true,
        findings: [
          { region: "Liver", normalText: "Normal hepatic size, echotexture, and echogenicity without focal lesion.", subpoints: ["Span: Normal (≈ 14 cm)", "Echotexture: Homogeneous"] },
          { region: "Gallbladder and Biliary", normalText: "Normal gallbladder without stone or wall thickening. No biliary dilatation.", subpoints: ["CBD: Normal (≤ 6 mm)", "Wall: Normal"] },
          { region: "Pancreas", normalText: "Visualized pancreas is normal without mass or ductal dilatation." },
          { region: "Spleen", normalText: "Normal splenic size and echotexture.", subpoints: ["Length: Normal (≤ 12 cm)"] },
          { region: "Kidneys", normalText: "Normal renal size and corticomedullary differentiation. No hydronephrosis or calculus.", subpoints: ["Right kidney: Normal", "Left kidney: Normal"] },
          { region: "Aorta and Vasculature", normalText: "Normal aortic caliber without aneurysm." },
        ],
      },
      { id: "us-abdomen-impression-2", name: "Impression", kind: "prose", grouped: false, isConclusion: true, normalImpression: "Normal abdominal ultrasound.", defaultProse: "<p>Normal abdominal ultrasound.</p>" },
    ],
  },

  // 10) Transvaginal Pelvic Ultrasound
  {
    id: "us-pelvis-tv",
    name: "Transvaginal Pelvic Ultrasound",
    modality: "US",
    bodyPart: "Pelvis",
    sections: [
      { id: "us-pelvis-technique-0", name: "Technique", kind: "prose", grouped: false, defaultProse: "<p>Transabdominal and transvaginal pelvic ultrasound performed.</p>" },
      {
        id: "us-pelvis-findings-1", name: "Findings", kind: "findings", grouped: true,
        findings: [
          { region: "Uterus", normalText: "Normal uterine size, contour, and myometrial echotexture.", subpoints: ["Dimensions: Normal", "Endometrium: Normal thickness, homogeneous", "Position: Anteverted"] },
          { region: "Right Ovary", normalText: "Normal right ovary without suspicious cyst or mass.", subpoints: ["Volume: Normal"] },
          { region: "Left Ovary", normalText: "Normal left ovary without suspicious cyst or mass.", subpoints: ["Volume: Normal"] },
          { region: "Adnexa and Cul-de-sac", normalText: "No adnexal mass. No free fluid." },
        ],
      },
      { id: "us-pelvis-impression-2", name: "Impression", kind: "prose", grouped: false, isConclusion: true, normalImpression: "Normal pelvic ultrasound.", defaultProse: "<p>Normal pelvic ultrasound.</p>" },
    ],
  },

  // 11) Obstetric Ultrasound (2nd/3rd trimester) — biometry subpoints
  {
    id: "us-ob",
    name: "Obstetric Ultrasound (Second/Third Trimester)",
    modality: "US",
    bodyPart: "Obstetric",
    sections: [
      { id: "us-ob-technique-0", name: "Technique", kind: "prose", grouped: false, defaultProse: "<p>Obstetric ultrasound performed for fetal growth and anatomy.</p>" },
      {
        id: "us-ob-findings-1", name: "Findings", kind: "findings", grouped: true,
        findings: [
          { region: "Fetal Number and Presentation", normalText: "Single live intrauterine pregnancy. Cephalic presentation." },
          { region: "Fetal Biometry", normalText: "Fetal biometry is consistent with dates.", subpoints: ["BPD: Appropriate for gestational age", "HC: Appropriate", "AC: Appropriate", "FL: Appropriate", "Estimated fetal weight: Appropriate (≈ 50th percentile)"] },
          { region: "Cardiac Activity", normalText: "Normal fetal cardiac activity.", subpoints: ["Heart rate: 140 bpm"] },
          { region: "Fetal Anatomy", normalText: "Survey of fetal anatomy is unremarkable for the gestational age." },
          { region: "Placenta and Cord", normalText: "Normally positioned placenta without previa. Three-vessel cord." },
          { region: "Amniotic Fluid and Cervix", normalText: "Normal amniotic fluid volume. Cervix appears normal in length.", subpoints: ["AFI: Normal", "Cervical length: Normal"] },
        ],
      },
      { id: "us-ob-impression-2", name: "Impression", kind: "prose", grouped: false, isConclusion: true, normalImpression: "Single live intrauterine pregnancy with growth appropriate for gestational age.", defaultProse: "<p>Single live intrauterine pregnancy with growth appropriate for gestational age.</p>" },
    ],
  },

  // 12) Thyroid Ultrasound
  {
    id: "us-thyroid",
    name: "Thyroid Ultrasound",
    modality: "US",
    bodyPart: "Neck",
    sections: [
      { id: "us-thyroid-technique-0", name: "Technique", kind: "prose", grouped: false, defaultProse: "<p>Grayscale and color Doppler ultrasound of the thyroid.</p>" },
      {
        id: "us-thyroid-findings-1", name: "Findings", kind: "findings", grouped: true,
        findings: [
          { region: "Right Lobe", normalText: "Normal size and echotexture without nodule.", subpoints: ["Dimensions: Normal"] },
          { region: "Left Lobe", normalText: "Normal size and echotexture without nodule.", subpoints: ["Dimensions: Normal"] },
          { region: "Isthmus", normalText: "Normal isthmus thickness." },
          { region: "Cervical Lymph Nodes", normalText: "No pathologically enlarged cervical lymph node." },
        ],
      },
      { id: "us-thyroid-impression-2", name: "Impression", kind: "prose", grouped: false, isConclusion: true, normalImpression: "Normal thyroid ultrasound.", defaultProse: "<p>Normal thyroid ultrasound.</p>" },
    ],
  },

  // 13) Carotid Doppler Ultrasound — velocity subpoints
  {
    id: "us-carotid",
    name: "Carotid Doppler Ultrasound",
    modality: "US",
    bodyPart: "Neck",
    sections: [
      { id: "us-carotid-technique-0", name: "Technique", kind: "prose", grouped: false, defaultProse: "<p>Bilateral carotid grayscale, color, and spectral Doppler ultrasound.</p>" },
      {
        id: "us-carotid-findings-1", name: "Findings", kind: "findings", grouped: true,
        findings: [
          { region: "Right Carotid System", normalText: "No hemodynamically significant stenosis. Antegrade vertebral flow.", subpoints: ["ICA PSV: Normal (< 125 cm/s)", "ICA/CCA ratio: Normal", "Plaque: None significant"] },
          { region: "Left Carotid System", normalText: "No hemodynamically significant stenosis. Antegrade vertebral flow.", subpoints: ["ICA PSV: Normal (< 125 cm/s)", "ICA/CCA ratio: Normal", "Plaque: None significant"] },
        ],
      },
      { id: "us-carotid-impression-2", name: "Impression", kind: "prose", grouped: false, isConclusion: true, normalImpression: "No hemodynamically significant carotid stenosis bilaterally.", defaultProse: "<p>No hemodynamically significant carotid stenosis bilaterally.</p>" },
    ],
  },

  // 14) Renal Ultrasound
  {
    id: "us-renal",
    name: "Renal Ultrasound",
    modality: "US",
    bodyPart: "Abdomen",
    sections: [
      { id: "us-renal-technique-0", name: "Technique", kind: "prose", grouped: false, defaultProse: "<p>Grayscale ultrasound of the kidneys and bladder.</p>" },
      {
        id: "us-renal-findings-1", name: "Findings", kind: "findings", grouped: true,
        findings: [
          { region: "Right Kidney", normalText: "Normal size, cortical thickness, and corticomedullary differentiation. No hydronephrosis or calculus.", subpoints: ["Length: Normal (9–12 cm)"] },
          { region: "Left Kidney", normalText: "Normal size, cortical thickness, and corticomedullary differentiation. No hydronephrosis or calculus.", subpoints: ["Length: Normal (9–12 cm)"] },
          { region: "Bladder", normalText: "Bladder is normal in appearance with no significant post-void residual." },
        ],
      },
      { id: "us-renal-impression-2", name: "Impression", kind: "prose", grouped: false, isConclusion: true, normalImpression: "Normal renal ultrasound.", defaultProse: "<p>Normal renal ultrasound.</p>" },
    ],
  },

  // 15) Diagnostic Mammogram — BI-RADS conclusion
  {
    id: "mg-diagnostic",
    name: "Diagnostic Mammogram (Bilateral)",
    modality: "MG",
    bodyPart: "Breast",
    sections: [
      { id: "mg-technique-0", name: "Technique", kind: "prose", grouped: false, defaultProse: "<p>Bilateral diagnostic mammography with standard and additional views.</p>" },
      { id: "mg-history-1", name: "Breast Composition", kind: "prose", grouped: false, defaultProse: "<p>The breasts are heterogeneously dense, which may obscure small masses (ACR category C).</p>" },
      {
        id: "mg-findings-2", name: "Findings", kind: "findings", grouped: true,
        findings: [
          { region: "Right Breast", normalText: "No suspicious mass, architectural distortion, or suspicious calcifications." },
          { region: "Left Breast", normalText: "No suspicious mass, architectural distortion, or suspicious calcifications." },
          { region: "Axillae", normalText: "No pathologically enlarged axillary lymph nodes." },
        ],
      },
      { id: "mg-impression-3", name: "Impression", kind: "prose", grouped: false, isConclusion: true, normalImpression: "No mammographic evidence of malignancy. BI-RADS 1 — Negative.", defaultProse: "<p>No mammographic evidence of malignancy. BI-RADS 1 — Negative.</p>" },
    ],
  },

  // 16) Breast Ultrasound
  {
    id: "us-breast",
    name: "Breast Ultrasound (Targeted)",
    modality: "US",
    bodyPart: "Breast",
    sections: [
      { id: "us-breast-technique-0", name: "Technique", kind: "prose", grouped: false, defaultProse: "<p>Targeted grayscale and color Doppler ultrasound of the breast.</p>" },
      {
        id: "us-breast-findings-1", name: "Findings", kind: "findings", grouped: true,
        findings: [
          { region: "Right Breast", normalText: "No suspicious solid mass or complex cyst in the area of concern." },
          { region: "Left Breast", normalText: "No suspicious solid mass or complex cyst in the area of concern." },
          { region: "Axillae", normalText: "No abnormal axillary lymph node." },
        ],
      },
      { id: "us-breast-impression-2", name: "Impression", kind: "prose", grouped: false, isConclusion: true, normalImpression: "No sonographic evidence of malignancy. BI-RADS 1.", defaultProse: "<p>No sonographic evidence of malignancy. BI-RADS 1.</p>" },
    ],
  },

  // 17) DEXA Bone Densitometry — T-score subpoints
  {
    id: "dexa",
    name: "DEXA Bone Densitometry",
    modality: "DEXA",
    bodyPart: "Spine & Hip",
    sections: [
      { id: "dexa-technique-0", name: "Technique", kind: "prose", grouped: false, defaultProse: "<p>Dual-energy X-ray absorptiometry of the lumbar spine and proximal femur.</p>" },
      {
        id: "dexa-findings-1", name: "Findings", kind: "findings", grouped: true,
        findings: [
          { region: "Lumbar Spine", normalText: "Bone mineral density within the normal range.", subpoints: ["L1–L4 T-score: ≥ −1.0", "Z-score: Within expected range"] },
          { region: "Femoral Neck", normalText: "Bone mineral density within the normal range.", subpoints: ["T-score: ≥ −1.0"] },
          { region: "Total Hip", normalText: "Bone mineral density within the normal range.", subpoints: ["T-score: ≥ −1.0"] },
        ],
      },
      { id: "dexa-impression-2", name: "Impression", kind: "prose", grouped: false, isConclusion: true, normalImpression: "Normal bone mineral density (WHO classification: normal).", defaultProse: "<p>Normal bone mineral density (WHO classification: normal).</p>" },
    ],
  },

  // 18) PET/CT Whole Body
  {
    id: "petct-wb",
    name: "FDG PET/CT Whole Body",
    modality: "PET",
    bodyPart: "Whole Body",
    sections: [
      { id: "petct-technique-0", name: "Technique", kind: "prose", grouped: false, defaultProse: "<p>Whole-body FDG PET/CT from skull base to mid-thigh after fasting; blood glucose within acceptable range.</p>" },
      {
        id: "petct-findings-1", name: "Findings", kind: "findings", grouped: true,
        findings: [
          { region: "Head and Neck", normalText: "No abnormal hypermetabolic focus." },
          { region: "Chest", normalText: "No hypermetabolic pulmonary nodule, mass, or lymphadenopathy." },
          { region: "Abdomen and Pelvis", normalText: "Physiologic uptake without abnormal focal hypermetabolism." },
          { region: "Skeleton and Soft Tissues", normalText: "No skeletal hypermetabolic lesion." },
        ],
      },
      { id: "petct-impression-2", name: "Impression", kind: "prose", grouped: false, isConclusion: true, normalImpression: "No FDG-avid disease.", defaultProse: "<p>No FDG-avid disease.</p>" },
    ],
  },

  // 19) Nuclear Medicine Whole Body Bone Scan
  {
    id: "nm-bonescan",
    name: "Whole Body Bone Scan",
    modality: "NM",
    bodyPart: "Whole Body",
    sections: [
      { id: "nm-bone-technique-0", name: "Technique", kind: "prose", grouped: false, defaultProse: "<p>Whole-body planar imaging performed following intravenous Tc-99m MDP.</p>" },
      {
        id: "nm-bone-findings-1", name: "Findings", kind: "findings", grouped: true,
        findings: [
          { region: "Axial Skeleton", normalText: "Symmetric tracer distribution without focal abnormal uptake." },
          { region: "Appendicular Skeleton", normalText: "No focal abnormal uptake." },
          { region: "Soft Tissue and Excretion", normalText: "Normal soft tissue and genitourinary tracer excretion." },
        ],
      },
      { id: "nm-bone-impression-2", name: "Impression", kind: "prose", grouped: false, isConclusion: true, normalImpression: "No scintigraphic evidence of osseous metastatic disease.", defaultProse: "<p>No scintigraphic evidence of osseous metastatic disease.</p>" },
    ],
  },

  // 20) Fluoroscopy Barium Swallow (Esophagram)
  {
    id: "fl-barium-swallow",
    name: "Fluoroscopic Barium Swallow",
    modality: "Fluoroscopy",
    bodyPart: "Esophagus",
    sections: [
      { id: "fl-bs-technique-0", name: "Technique", kind: "prose", grouped: false, defaultProse: "<p>Fluoroscopic barium swallow performed with single- and double-contrast technique.</p>" },
      {
        id: "fl-bs-findings-1", name: "Findings", kind: "findings", grouped: true,
        findings: [
          { region: "Oral and Pharyngeal Phase", normalText: "Normal bolus formation and pharyngeal transit without aspiration." },
          { region: "Esophagus", normalText: "Normal esophageal caliber, contour, and peristalsis. No stricture, mass, or ulcer." },
          { region: "Gastroesophageal Junction", normalText: "No hiatal hernia or spontaneous gastroesophageal reflux." },
        ],
      },
      { id: "fl-bs-impression-2", name: "Impression", kind: "prose", grouped: false, isConclusion: true, normalImpression: "Normal barium swallow.", defaultProse: "<p>Normal barium swallow.</p>" },
    ],
  },
];

const STANDARD_TEMPLATE_IDS = new Set([
  "xr-chest",
  "ct-head",
  "ct-chest",
  "ct-abdomen",
  "mri-brain",
]);

// The offline fallback mirrors the server's deliberately small starter set.
export const SEED_TEMPLATES = TEMPLATE_CATALOG.filter((template) =>
  STANDARD_TEMPLATE_IDS.has(template.id)
);
