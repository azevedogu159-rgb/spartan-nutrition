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

    async function start() {
      if (!navigator.mediaDevices?.getUserMedia || !window.BarcodeDetector) {
        setStatus("Este navegador nao tem leitura nativa de codigo de barras.");
        return;
      }

      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
        });
        const video = videoRef.current;
        if (!video || cancelled) return;

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
        frame = requestAnimationFrame(scan);
      } catch {
        setStatus("Permita o acesso a camera para escanear.");
      }
    }

    start();

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
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
