import type { ComponentProps } from 'react';
import { cn } from 'cn';

import { Button } from './button.js';
import { Input } from './input.js';
import { Textarea } from './textarea.js';

function InputGroup({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn('scriptr-ui-input-group', className)}
      data-slot="input-group"
      role="group"
      {...props}
    />
  );
}
function InputGroupAddon({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn('scriptr-ui-input-group__addon', className)}
      data-slot="input-group-addon"
      {...props}
    />
  );
}
function InputGroupButton(props: ComponentProps<typeof Button>) {
  return <Button size="icon-sm" type="button" variant="ghost" {...props} />;
}
function InputGroupText(props: ComponentProps<'span'>) {
  return <span data-slot="input-group-text" {...props} />;
}
function InputGroupInput(props: ComponentProps<typeof Input>) {
  return <Input data-slot="input-group-control" {...props} />;
}
function InputGroupTextarea(props: ComponentProps<typeof Textarea>) {
  return <Textarea data-slot="input-group-control" {...props} />;
}

export {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  InputGroupText,
  InputGroupTextarea,
};
