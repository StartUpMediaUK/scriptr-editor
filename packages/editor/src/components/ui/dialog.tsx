import { Dialog as DialogPrimitive } from '@base-ui/react/dialog';
import type { ComponentProps } from 'react';
import { X } from 'lucide-react';
import { cn } from 'cn';

import { Button } from './button.js';
import { ScrollArea } from './scroll-area.js';

const Dialog = DialogPrimitive.Root;
const DialogTrigger = DialogPrimitive.Trigger;
const DialogClose = DialogPrimitive.Close;

function DialogContent({
  children,
  className,
  showCloseButton = false,
  ...props
}: DialogPrimitive.Popup.Props & { readonly showCloseButton?: boolean }) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Backdrop
        className="scriptr-editor__workflow-backdrop"
        data-slot="dialog-overlay"
      />
      <DialogPrimitive.Popup
        className={cn(
          'scriptr-editor__workflow-dialog scriptr-editor__workflow-dialog--modal',
          className,
        )}
        data-slot="dialog-content"
        {...props}
      >
        <ScrollArea className="scriptr-editor__workflow-scroll">
          {children}
        </ScrollArea>
        {showCloseButton ? (
          <DialogPrimitive.Close
            aria-label="Close dialog"
            render={<Button size="icon-sm" variant="ghost" />}
          >
            <X />
          </DialogPrimitive.Close>
        ) : null}
      </DialogPrimitive.Popup>
    </DialogPrimitive.Portal>
  );
}

function DialogHeader({ className, ...props }: ComponentProps<'header'>) {
  return (
    <header
      className={cn('scriptr-editor__workflow-header', className)}
      data-slot="dialog-header"
      {...props}
    />
  );
}

function DialogFooter({ className, ...props }: ComponentProps<'footer'>) {
  return (
    <footer
      className={cn('scriptr-editor__workflow-actions', className)}
      data-slot="dialog-footer"
      {...props}
    />
  );
}

function DialogTitle(props: DialogPrimitive.Title.Props) {
  return <DialogPrimitive.Title data-slot="dialog-title" {...props} />;
}

function DialogDescription(props: DialogPrimitive.Description.Props) {
  return (
    <DialogPrimitive.Description data-slot="dialog-description" {...props} />
  );
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
};
