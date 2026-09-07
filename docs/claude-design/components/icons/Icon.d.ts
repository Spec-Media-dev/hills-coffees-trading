import * as React from 'react';

export interface IconProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Lucide icon name in kebab-case, e.g. "package", "map-pin", "file-text". */
  name: string;
  /** Pixel box for the glyph. Default 18. */
  size?: number;
  /** Lucide stroke width. Hills uses a uniform 1.75. */
  strokeWidth?: number;
  color?: string;
}
export declare function Icon(props: IconProps): JSX.Element;
