import type { ComponentProps } from 'react';
import { cn } from 'cn';

function Label({ className, ...props }: ComponentProps<'label'>) {
  return (
    <label
      className={cn('scriptr-ui-label', className)}
      data-slot="label"
      {...props}
    />
  );
}

export { Label };
