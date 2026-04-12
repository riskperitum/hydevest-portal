import Image from "next/image";

type BrandLogoProps = {
  className?: string;
  priority?: boolean;
};

const SRC = "/logo/hydevest-logo.png";

/**
 * Hydevest wordmark (242×88). Scale with Tailwind, e.g. `h-8 w-auto object-contain`.
 */
export function BrandLogo({
  className = "h-10 w-auto max-w-full object-contain object-left",
  priority = false,
}: BrandLogoProps) {
  return (
    <Image
      src={SRC}
      alt="Hydevest"
      width={242}
      height={88}
      priority={priority}
      className={className}
    />
  );
}
