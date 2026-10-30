import type { HTMLAttributes, ReactElement } from "react";
import { LayersIcon } from "lucide-react";

export function Heading({ as: Tag = "h2", icon = <LayersIcon />, className = "", children, ...props }: HTMLAttributes<HTMLHeadingElement> & {
  as?: "h1" | "h2" | "h3"; icon?: ReactElement;
}) {
  return <Tag {...props} className={`ui-heading ${className}`}><span className="ui-heading-icon" aria-hidden="true">{icon}</span><span>{children}</span></Tag>;
}
