import { ScrollArea as ScrollAreaPrimitive } from '@base-ui/react/scroll-area';
import type { ReactNode } from 'react';
import { cn } from 'cn';

function ScrollArea({
  children,
  className,
  ...props
}: ScrollAreaPrimitive.Root.Props & { readonly children: ReactNode }) {
  return (
    <ScrollAreaPrimitive.Root
      className={cn('scriptr-ui-scroll-area', className)}
      data-slot="scroll-area"
      {...props}
    >
      <ScrollAreaPrimitive.Viewport
        className="scriptr-ui-scroll-area__viewport"
        data-slot="scroll-area-viewport"
      >
        {children}
      </ScrollAreaPrimitive.Viewport>
      <ScrollBar />
      <ScrollAreaPrimitive.Corner className="scriptr-ui-scroll-area__corner" />
    </ScrollAreaPrimitive.Root>
  );
}

function ScrollBar({
  className,
  orientation = 'vertical',
  ...props
}: ScrollAreaPrimitive.Scrollbar.Props) {
  return (
    <ScrollAreaPrimitive.Scrollbar
      className={cn('scriptr-ui-scroll-area__bar', className)}
      data-orientation={orientation}
      data-slot="scroll-area-scrollbar"
      orientation={orientation}
      {...props}
    >
      <ScrollAreaPrimitive.Thumb
        className="scriptr-ui-scroll-area__thumb"
        data-slot="scroll-area-thumb"
      />
    </ScrollAreaPrimitive.Scrollbar>
  );
}

export { ScrollArea, ScrollBar };
