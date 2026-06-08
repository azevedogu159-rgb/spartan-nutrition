import { useEffect, useRef, useState } from "react";
import { Camera } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onScan: (code: string) => void;
};

type ZxingControls = {
  stop?: () => void;
};

type ZxingResult = {
  getText?: () => string;
  text?: string;
};

type ZxingModule = {
  BrowserMultiFormatReader: new () => {
    decodeFromVideoDevice: (
      deviceId: string | undefined,
      video: HTMLVideoElement,
      callback: (result?: ZxingResult, error?: unknown, controls?: ZxingControls) => void,
    ) => Promise<ZxingControls | void>;
    decodeFromVideoElement: (
      video: HTMLVideoElement,
      callback: (result?: ZxingResult, error?: unknown, controls?: ZxingControls) => void,
    ) => Promise<ZxingControls | void>;
  };
};

declare global {
  interface Window {
    BarcodeDetector?: new (options?: { formats?: string[] }) => {
      detect: (source: HTMLVideoElement) => Promise<{ rawValue: string }[]>;
    };
  }
}

const formats = [
  "ean_13",
  "ean_8",
  "upc_a",
  "upc_e",
  "code_128",
  "code_39",
  "itf",
];

export function BarcodeScannerDialog({ open, onOpenChange, onScan }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [status, setStatus] = useState("Toque em iniciar para liberar a camera.");
  const [isStarting, setIsStarting] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (open) {
      setStatus("Toque em iniciar para liberar a camera.");
      setIsStarting(false);
      setIsScanning(false);
      return;
    }

    cleanupRef.current?.();
    cleanupRef.current = null;
  }, [open]);

  async function startScanner() {
    cleanupRef.current?.();
    cleanupRef.current = null;
    setIsStarting(true);
    setStatus("Solicitando acesso a camera...");

    let cancelled = false;
    let frame = 0;
    let stream: MediaStream | null = null;
    let zxingControls: ZxingControls | undefined;

    async function startCamera(video: HTMLVideoElement) {
      stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });

      video.srcObject = stream;
      video.muted = true;
      video.setAttribute("playsinline", "true");
      video.setAttribute("autoplay", "true");
      await video.play();
    }

    const cleanup = () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      zxingControls?.stop?.();
      stream?.getTracks().forEach((track) => track.stop());
      setIsScanning(false);
      setIsStarting(false);
    };

    cleanupRef.current = cleanup;

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        setStatus("Este navegador nao permite acesso a camera. Digite o codigo manualmente.");
        setIsStarting(false);
        return;
      }

      const video = videoRef.current;
      if (!video || cancelled) return;

      if (window.BarcodeDetector) {
        await startCamera(video);
        setIsScanning(true);

        const detector = new window.BarcodeDetector({ formats });
        const scan = async () => {
          if (cancelled || !videoRef.current) return;
          try {
            const results = await detector.detect(videoRef.current);
            const code = results[0]?.rawValue?.trim();
            if (code) {
              cleanup();
              onScan(code);
              onOpenChange(false);
              return;
            }
          } catch {
            setStatus("Nao consegui ler ainda. Ajuste a distancia e a luz.");
          }
          frame = requestAnimationFrame(scan);
        };

        setStatus("Aponte a camera para o codigo de barras.");
        setIsStarting(false);
        frame = requestAnimationFrame(scan);
        return;
      }

      setStatus("Carregando leitor compativel com iPhone...");
      const { BrowserMultiFormatReader } = (await import(
        /* @vite-ignore */ "https://esm.sh/@zxing/browser@0.1.5?bundle"
      )) as ZxingModule;
      if (cancelled) return;

      await startCamera(video);
      if (cancelled) return;
      setIsScanning(true);

      const reader = new BrowserMultiFormatReader();
      zxingControls =
        (await reader.decodeFromVideoElement(video, (result, _error, controls) => {
          const code = (result?.getText?.() ?? result?.text ?? "").trim();
          if (!code) return;

          controls?.stop?.();
          cleanup();
          onScan(code);
          onOpenChange(false);
        })) ?? undefined;
      setStatus("Aponte a camera para o codigo de barras.");
      setIsStarting(false);
    } catch {
      cleanup();
      setStatus("Nao consegui iniciar o leitor. Permita a camera ou digite o codigo manualmente.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Camera className="h-4 w-4" /> Ler codigo de barras
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            className="aspect-[4/3] w-full rounded-md bg-black object-cover"
          />
          <p className="text-sm text-muted-foreground">{status}</p>
          {!isScanning && (
            <Button type="button" className="w-full" onClick={startScanner} disabled={isStarting}>
              {isStarting ? "Abrindo camera..." : "Iniciar camera"}
            </Button>
          )}
          <Button type="button" variant="outline" className="w-full" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
