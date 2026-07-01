import * as React from "react";

export const Progress = React.forwardRef<
	HTMLDivElement,
	React.HTMLAttributes<HTMLDivElement> & { value?: number | null }
>(({ className = "", value, ...props }, ref) => (
	<div
		ref={ref}
		className={`relative h-2 w-full overflow-hidden rounded-full bg-white/25 ${className}`}
		{...props}
	>
		<div
			className="h-full bg-white transition-all duration-300"
			style={{ width: `${Math.max(0, Math.min(100, Number(value) || 0))}%` }}
		/>
	</div>
));

Progress.displayName = "Progress";
