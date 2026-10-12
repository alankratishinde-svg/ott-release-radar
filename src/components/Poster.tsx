import Image from "next/image";

const BLUR = "data:image/svg+xml;base64," + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="8" height="12"><rect width="8" height="12" fill="#232731"/></svg>').toString("base64");

/** Parent must be position:relative with a size. Renders the image, or the title on a hatched tile when there is no poster. */
export default function Poster({ src, alt, sizes, priority, className }: { src: string | null; alt: string; sizes: string; priority?: boolean; className?: string }) {
  if (!src) return <span className={`poster-empty ${className ?? ""}`} role="img" aria-label={`${alt} (no poster available)`}><span>{alt}</span></span>;
  return <Image src={src} alt={alt} fill sizes={sizes} priority={priority} placeholder="blur" blurDataURL={BLUR} className={className} style={{ objectFit: "cover" }} />;
}
