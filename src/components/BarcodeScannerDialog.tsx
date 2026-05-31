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
  const [status, setStatus] = useState("Aponte a camera para o codigo de barras.");

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    let frame = 0;
    let stream: MediaStream | null = null;
    let zxingControls: ZxingControls | undefined;

    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setStatus("Este navegador nao permite acesso a camera. Digite o codigo manualmente.");
        return;
      }

      try {
        const video = videoRef.current;
        if (!video || cancelled) return;

        if (window.BarcodeDetector) {
          stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: { ideal: "environment" } },
          });

          video.srcObject = stream;
          await video.play();

          const detector = new window.BarcodeDetector({ formats });
          const scan = async () => {
            if (cancelled || !videoRef.current) return;
            try {
              const results = await detector.detect(videoRef.current);
              const code = results[0]?.rawValue?.trim();
              if (code) {
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
          frame = requestAnimationFrame(scan);
          return;
        }

        setStatus("Carregando leitor compativel com iPhone...");
        const { BrowserMultiFormatReader } = (await import(
          /* @vite-ignore */ "https://esm.sh/@zxing/browser@0.1.5?bundle"
        )) as ZxingModule;
        if (cancelled) return;

        const reader = new BrowserMultiFormatReader();
        zxingControls =
          (await reader.decodeFromVideoDevice(undefined, video, (result, _error, controls) => {
            const code = (result?.getText?.() ?? result?.text ?? "").trim();
            if (!code) return;

            controls?.stop?.();
            onScan(code);
            onOpenChange(false);
          })) ?? undefined;
        setStatus("Aponte a camera para o codigo de barras.");
      } catch {
        setStatus("Nao consegui iniciar o leitor. Permita a camera ou digite o codigo manualmente.");
      }
    }

    start();

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      zxingControls?.stop?.();
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [onOpenChange, onScan, open]);

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
            muted
            playsInline
            className="aspect-[4/3] w-full rounded-md bg-black object-cover"
          />
          <p className="text-sm text-muted-foreground">{status}</p>
          <Button type="button" variant="outline" className="w-full" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
