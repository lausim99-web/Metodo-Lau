// Metriche progressi condivise tra PT e atleta (ordine = ordine di visualizzazione)
export const METRICS = [
  { k: "weight_kg", label: "Peso", short: "Peso", unit: "kg", color: "#F5C518", group: "Composizione" },
  { k: "lean_mass_kg", label: "Massa magra", short: "Magra", unit: "kg", color: "#4ADE80", group: "Composizione" },
  { k: "fat_mass_kg", label: "Massa grassa", short: "Grassa", unit: "kg", color: "#FB923C", group: "Composizione" },
  { k: "bia_fat", label: "Grasso", short: "Grasso %", unit: "%", color: "#FF6B6B", group: "Composizione" },
  { k: "bia_muscle", label: "Muscolo", short: "Muscolo %", unit: "%", color: "#A3E635", group: "BIA" },
  { k: "bia_water", label: "Acqua", short: "Acqua %", unit: "%", color: "#38BDF8", group: "BIA" },
  { k: "bia_bmi", label: "BMI", short: "BMI", unit: "", color: "#C084FC", group: "BIA" },
  { k: "waist_cm", label: "Vita", short: "Vita", unit: "cm", color: "#F472B6", group: "Circonferenze" },
  { k: "hips_cm", label: "Fianchi", short: "Fianchi", unit: "cm", color: "#E879F9", group: "Circonferenze" },
  { k: "chest_cm", label: "Torace", short: "Torace", unit: "cm", color: "#60A5FA", group: "Circonferenze" },
  { k: "arms_cm", label: "Braccia", short: "Braccia", unit: "cm", color: "#2DD4BF", group: "Circonferenze" },
  { k: "legs_cm", label: "Gambe", short: "Gambe", unit: "cm", color: "#FACC15", group: "Circonferenze" },
];

export const METRIC_KEYS = METRICS.map((m) => m.k);

export const emptyProgress = () => Object.fromEntries([["date", ""], ...METRIC_KEYS.map((k) => [k, ""]), ["notes", ""]]);


// "2026-10-19" -> "19/10/2026" (formato italiano)
export const fmtDate = (iso) => {
  if (!iso) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
};

// variazione rispetto alla rilevazione precedente (es. "-2,3")
export const delta = (curr, prev) => {
  if (curr == null || prev == null) return null;
  const d = Number(curr) - Number(prev);
  if (!d) return "=";
  return `${d > 0 ? "+" : "−"}${Math.abs(d).toFixed(1).replace(".", ",")}`;
};
