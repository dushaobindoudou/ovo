import type { MouseEventHandler, PropsWithChildren } from "react";
import { GlowButton } from "../shared/GlowButton";

interface ActionButtonProps extends PropsWithChildren {
  onClick?: MouseEventHandler<HTMLButtonElement>;
}

export function ActionButton({ children, onClick }: ActionButtonProps) {
  return (
    <GlowButton className="px-2 py-1 text-xs" onClick={onClick}>
      {children}
    </GlowButton>
  );
}
