import type { ComponentProps } from 'react';
import { cn } from 'cn';
import { Label } from './label.js';

function FieldGroup({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn('scriptr-ui-field-group', className)}
      data-slot="field-group"
      {...props}
    />
  );
}

function Field({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn('scriptr-ui-field', className)}
      data-slot="field"
      role="group"
      {...props}
    />
  );
}

function FieldLabel({ className, ...props }: ComponentProps<typeof Label>) {
  return (
    <Label
      className={cn('scriptr-ui-field-label', className)}
      data-slot="field-label"
      {...props}
    />
  );
}

function FieldDescription({ className, ...props }: ComponentProps<'p'>) {
  return (
    <p
      className={cn('scriptr-ui-field-description', className)}
      data-slot="field-description"
      {...props}
    />
  );
}

function FieldError({ className, ...props }: ComponentProps<'p'>) {
  return (
    <p
      className={cn('scriptr-ui-field-error', className)}
      data-slot="field-error"
      role="alert"
      {...props}
    />
  );
}

export { Field, FieldDescription, FieldError, FieldGroup, FieldLabel };
