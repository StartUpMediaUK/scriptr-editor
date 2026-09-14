import { Command as CommandPrimitive } from 'cmdk';
import { Check, Search } from 'lucide-react';
import type { ComponentProps, ReactNode } from 'react';
import { cn } from 'cn';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from './dialog.js';
import { ScrollArea } from './scroll-area.js';

function Command({
  className,
  ...props
}: ComponentProps<typeof CommandPrimitive>) {
  return (
    <CommandPrimitive
      className={cn('scriptr-ui-command', className)}
      data-slot="command"
      {...props}
    />
  );
}

function CommandDialog({
  title = 'Command palette',
  description = 'Search for a command',
  children,
  ...props
}: Omit<ComponentProps<typeof Dialog>, 'children'> & {
  readonly title?: string;
  readonly description?: string;
  readonly children: ReactNode;
}) {
  return (
    <Dialog {...props}>
      <DialogContent>
        <DialogHeader className="sr-only">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}

function CommandInput({
  className,
  ...props
}: ComponentProps<typeof CommandPrimitive.Input>) {
  return (
    <label className="scriptr-ui-command__input">
      <Search aria-hidden="true" />
      <CommandPrimitive.Input
        className={className}
        data-slot="command-input"
        {...props}
      />
    </label>
  );
}

function CommandList({
  className,
  ...props
}: ComponentProps<typeof CommandPrimitive.List>) {
  return (
    <ScrollArea className="scriptr-ui-command__scroll">
      <CommandPrimitive.List
        className={className}
        data-slot="command-list"
        {...props}
      />
    </ScrollArea>
  );
}
function CommandEmpty(props: ComponentProps<typeof CommandPrimitive.Empty>) {
  return <CommandPrimitive.Empty data-slot="command-empty" {...props} />;
}
function CommandGroup(props: ComponentProps<typeof CommandPrimitive.Group>) {
  return <CommandPrimitive.Group data-slot="command-group" {...props} />;
}
function CommandSeparator(
  props: ComponentProps<typeof CommandPrimitive.Separator>,
) {
  return (
    <CommandPrimitive.Separator data-slot="command-separator" {...props} />
  );
}

function CommandItem({
  children,
  ...props
}: ComponentProps<typeof CommandPrimitive.Item>) {
  return (
    <CommandPrimitive.Item data-slot="command-item" {...props}>
      {children}
      <Check aria-hidden="true" className="scriptr-ui-command__check" />
    </CommandPrimitive.Item>
  );
}

function CommandShortcut(props: ComponentProps<'span'>) {
  return <span data-slot="command-shortcut" {...props} />;
}

export {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
};
