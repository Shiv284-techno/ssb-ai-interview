import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

const baseProps = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
  focusable: false,
} satisfies IconProps;

export function CameraIcon(props: IconProps) {
  return (
    <svg {...baseProps} {...props}>
      <rect x="2.5" y="6" width="13" height="12" rx="2.5" />
      <path d="m15.5 10.5 5-3v9l-5-3z" />
    </svg>
  );
}

export function CameraOffIcon(props: IconProps) {
  return (
    <svg {...baseProps} {...props}>
      <path d="M10.8 6H13a2.5 2.5 0 0 1 2.5 2.5v2.1m0 3.3v.6A2.5 2.5 0 0 1 13 17H5a2.5 2.5 0 0 1-2.5-2.5v-6A2.5 2.5 0 0 1 5 6h1" />
      <path d="m15.5 10.5 5-3v9l-2.6-1.6" />
      <path d="m3 3 18 18" />
    </svg>
  );
}

export function MicIcon(props: IconProps) {
  return (
    <svg {...baseProps} {...props}>
      <rect x="9" y="2.5" width="6" height="11" rx="3" />
      <path d="M5.5 11a6.5 6.5 0 0 0 13 0" />
      <path d="M12 17.5V21" />
      <path d="M8.5 21h7" />
    </svg>
  );
}

export function MicOffIcon(props: IconProps) {
  return (
    <svg {...baseProps} {...props}>
      <path d="M9 9.6V5.5a3 3 0 0 1 5.9-.7" />
      <path d="M15 10.9V11a3 3 0 0 1-4.6 2.5" />
      <path d="M5.5 11a6.5 6.5 0 0 0 10.2 5.3" />
      <path d="M18.5 11v.3" />
      <path d="M12 17.5V21" />
      <path d="M8.5 21h7" />
      <path d="m3 3 18 18" />
    </svg>
  );
}

export function EndCallIcon(props: IconProps) {
  return (
    <svg {...baseProps} {...props}>
      <g transform="rotate(135 12 12)">
        <path d="M20.5 16.2v2.5a1.8 1.8 0 0 1-2 1.8 17.6 17.6 0 0 1-7.7-2.7 17.3 17.3 0 0 1-5.3-5.3A17.6 17.6 0 0 1 2.8 4.8a1.8 1.8 0 0 1 1.8-2h2.5a1.8 1.8 0 0 1 1.8 1.5c.1.9.3 1.7.6 2.5a1.8 1.8 0 0 1-.4 1.9L8 9.8a14.2 14.2 0 0 0 5.3 5.3l1.1-1.1a1.8 1.8 0 0 1 1.9-.4c.8.3 1.6.5 2.5.6a1.8 1.8 0 0 1 1.5 1.8z" />
      </g>
    </svg>
  );
}

export function PlayIcon(props: IconProps) {
  return (
    <svg {...baseProps} {...props}>
      <path d="M8 5.6 18 12 8 18.4z" />
    </svg>
  );
}

export function ArrowRightIcon(props: IconProps) {
  return (
    <svg {...baseProps} {...props}>
      <path d="M4.5 12h15" />
      <path d="m13.5 6 6 6-6 6" />
    </svg>
  );
}

export function CheckIcon(props: IconProps) {
  return (
    <svg {...baseProps} {...props}>
      <path d="m4.5 12.5 5 5 10-11" />
    </svg>
  );
}

export function AlertIcon(props: IconProps) {
  return (
    <svg {...baseProps} {...props}>
      <path d="M12 4 2.8 20h18.4z" />
      <path d="M12 10v4" />
      <path d="M12 17.2v.3" />
    </svg>
  );
}

export function TimerIcon(props: IconProps) {
  return (
    <svg {...baseProps} {...props}>
      <circle cx="12" cy="12.5" r="8" />
      <path d="M12 8.5v4l2.5 1.8" />
      <path d="M9.5 2.5h5" />
    </svg>
  );
}

export function ShieldIcon(props: IconProps) {
  return (
    <svg {...baseProps} {...props}>
      <path d="M12 2.5 4.5 5.4v6.1c0 4.4 3.1 8.5 7.5 10 4.4-1.5 7.5-5.6 7.5-10V5.4z" />
      <path d="m12 8.4 1.3 2.6 2.9.4-2.1 2 .5 2.9-2.6-1.4-2.6 1.4.5-2.9-2.1-2 2.9-.4z" />
    </svg>
  );
}
