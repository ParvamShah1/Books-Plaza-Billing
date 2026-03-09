interface BadgeProps {
  variant: "success" | "warning" | "error" | "info" | "default";
  children: React.ReactNode;
}

const variants = {
  success: "bg-green-50 text-green-700 border-green-200",
  warning: "bg-yellow-50 text-yellow-700 border-yellow-200",
  error: "bg-red-50 text-red-700 border-red-200",
  info: "bg-blue-50 text-blue-700 border-blue-200",
  default: "bg-gray-50 text-neutral-700 border-gray-200",
};

export function Badge({ variant, children }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-md border ${variants[variant]}`}
    >
      {children}
    </span>
  );
}
