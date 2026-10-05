import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

export const api = axios.create({
  baseURL: API,
  withCredentials: true,
});

// Persist bearer token: localStorage if "rimani collegato", otherwise sessionStorage
const TK = "lau_token";
export const getToken = () => localStorage.getItem(TK) || sessionStorage.getItem(TK);
export const setToken = (t, remember = true) => {
  localStorage.removeItem(TK); sessionStorage.removeItem(TK);
  if (t) (remember ? localStorage : sessionStorage).setItem(TK, t);
};

api.interceptors.request.use((cfg) => {
  const t = getToken();
  if (t) cfg.headers.Authorization = `Bearer ${t}`;
  return cfg;
});

export function formatErr(e) {
  const d = e?.response?.data?.detail;
  if (!d) return e?.message || "Errore imprevisto";
  if (typeof d === "string") return d;
  if (Array.isArray(d)) return d.map((x) => x?.msg || JSON.stringify(x)).join(" ");
  return String(d);
}
