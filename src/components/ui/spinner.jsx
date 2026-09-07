import { cn } from "@/lib/utils"

function Spinner({
  className,
  ...props
}) {
  return (
    <span
      role="status"
      aria-label="Loading"
      data-slot="spinner"
      className={cn("sc-circular-progress-indicator size-4", className)}
      {...props}
    />
  );
}

export { Spinner }
