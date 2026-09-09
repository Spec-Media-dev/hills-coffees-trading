import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

type ContainerProps = ComponentProps<"div"> & {
  measure?: "product" | "editorial" | "article";
};

const measureClasses = {
  product: "hc-container",
  editorial: "hc-container hc-editorial-measure",
  article: "hc-container hc-article-measure",
} as const;

export function Container({ className, measure = "product", ...props }: ContainerProps) {
  return <div className={cn(measureClasses[measure], className)} {...props} />;
}
