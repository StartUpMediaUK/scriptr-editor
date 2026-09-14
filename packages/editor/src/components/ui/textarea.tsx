import type { ComponentProps } from 'react';
import { cn } from 'cn';

function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return (
    <textarea
      className={cn('scriptr-ui-textarea', className)}
      data-slot="textarea"
      {...props}
    />
  );
}

export { Textarea };
