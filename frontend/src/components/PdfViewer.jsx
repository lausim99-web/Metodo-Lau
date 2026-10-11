import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import { X, Download, ZoomIn, ZoomOut, Loader2 } from "lucide-react";

pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

export default function PdfViewer({ url, title, onClose, onDownload }) {
  const [pages, setPages] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [width, setWidth] = useState(Math.min(window.innerWidth, 900) - 16);
  const [err, setErr] = useState("");

  useEffect(() => {
    const onResize = () => setWidth(Math.min(window.innerWidth, 900) - 16);
    window.addEventListener("resize", onResize);
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("resize", onResize); window.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [onClose]);

  return createPortal(
    <div className="fixed inset-0 z-[100] bg-[#0A0A0D] flex flex-col" data-testid="pdf-viewer">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[#262633] bg-[#121218] shrink-0" style={{ paddingTop: "max(0.5rem, env(safe-area-inset-top))" }}>
        <button onClick={onClose} data-testid="pdf-viewer-close" className="lau-gold-btn px-3 py-2 rounded flex items-center gap-1 text-xs">
          <X size={16} /> Chiudi
        </button>
        <div className="flex-1 min-w-0 font-display font-bold uppercase text-white text-sm truncate">{title}</div>
        <button onClick={() => setZoom((z) => Math.max(0.6, z - 0.2))} data-testid="pdf-zoom-out" className="p-2 rounded border border-[#262633] text-zinc-200"><ZoomOut size={16} /></button>
        <button onClick={() => setZoom((z) => Math.min(3, z + 0.2))} data-testid="pdf-zoom-in" className="p-2 rounded border border-[#262633] text-zinc-200"><ZoomIn size={16} /></button>
        <button onClick={onDownload} data-testid="pdf-viewer-download" className="p-2 rounded border border-[#262633] text-zinc-200"><Download size={16} /></button>
      </div>
      <div className="flex-1 overflow-auto p-2">
        <div className="min-w-fit mx-auto flex flex-col items-center gap-3">
        {err && <div className="text-red-400 text-sm mt-10" data-testid="pdf-viewer-error">{err}</div>}
        <Document
          file={url}
          onLoadSuccess={({ numPages }) => setPages(numPages)}
          onLoadError={() => setErr("Impossibile aprire il PDF. Prova con Scarica.")}
          loading={<div className="flex items-center gap-2 text-zinc-400 mt-10"><Loader2 className="animate-spin" size={18} /> Caricamento…</div>}
        >
          {Array.from({ length: pages }, (_, i) => (
            <Page key={i} pageNumber={i + 1} width={width * zoom} className="mb-3 shadow-2xl" renderAnnotationLayer={false} renderTextLayer={false} />
          ))}
        </Document>
        {pages > 0 && <div className="text-[10px] uppercase tracking-widest text-zinc-500 font-mono-num pb-6">{pages} {pages === 1 ? "pagina" : "pagine"}</div>}
        </div>
      </div>
    </div>,
    document.body
  );
}
