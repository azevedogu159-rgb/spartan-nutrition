import { useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { ImageOff } from "lucide-react";

type Props = {
  url: string | null | undefined;
  alt?: string;
  size?: number;
  className?: string;
};

export function ProductImage({ url, alt = "Foto do produto", size = 40, className = "" }: Props) {
  const [open, setOpen] = useState(false);
  const dim = { width: size, height: size };

  if (!url) {
    return (
      <div
        style={dim}
        className={`flex items-center justify-center rounded-md bg-secondary text-muted-foreground ${className}`}
        aria-label="Sem foto"
      >
        <ImageOff className="h-4 w-4" />
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={dim}
        className={`overflow-hidden rounded-md ring-1 ring-border hover:ring-accent transition ${className}`}
        aria-label="Ampliar foto"
      >
        <img src={url} alt={alt} className="h-full w-full object-cover" />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl p-2 bg-background">
          <img src={url} alt={alt} className="w-full h-auto rounded-md object-contain max-h-[80vh]" />
        </DialogContent>
      </Dialog>
    </>
  );
}
