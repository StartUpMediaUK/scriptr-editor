import { Combobox as ComboboxPrimitive } from '@base-ui/react/combobox';
import { Check, ChevronDown, X } from 'lucide-react';
import { cn } from 'cn';

import { Button } from './button.js';

const Combobox = ComboboxPrimitive.Root;
const ComboboxValue = ComboboxPrimitive.Value;

function ComboboxInput({
  className,
  showClear = false,
  showTrigger = true,
  ...props
}: ComboboxPrimitive.Input.Props & {
  readonly showClear?: boolean;
  readonly showTrigger?: boolean;
}) {
  return (
    <div className={cn('scriptr-ui-combobox__input', className)}>
      <ComboboxPrimitive.Input {...props} />
      {showClear ? (
        <ComboboxPrimitive.Clear
          aria-label="Clear"
          render={<Button size="icon-xs" variant="ghost" />}
        >
          <X />
        </ComboboxPrimitive.Clear>
      ) : null}
      {showTrigger ? (
        <ComboboxPrimitive.Trigger
          aria-label="Show choices"
          render={<Button size="icon-xs" variant="ghost" />}
        >
          <ChevronDown />
        </ComboboxPrimitive.Trigger>
      ) : null}
    </div>
  );
}

function ComboboxContent({
  className,
  sideOffset = 4,
  ...props
}: ComboboxPrimitive.Popup.Props &
  Pick<ComboboxPrimitive.Positioner.Props, 'align' | 'side' | 'sideOffset'>) {
  const { align, side, ...popupProps } = props;
  return (
    <ComboboxPrimitive.Portal>
      <ComboboxPrimitive.Positioner
        align={align}
        className="scriptr-ui-positioner"
        side={side}
        sideOffset={sideOffset}
      >
        <ComboboxPrimitive.Popup
          className={cn('scriptr-ui-combobox__content', className)}
          {...popupProps}
        />
      </ComboboxPrimitive.Positioner>
    </ComboboxPrimitive.Portal>
  );
}

function ComboboxList(props: ComboboxPrimitive.List.Props) {
  return <ComboboxPrimitive.List data-slot="combobox-list" {...props} />;
}
function ComboboxGroup(props: ComboboxPrimitive.Group.Props) {
  return <ComboboxPrimitive.Group data-slot="combobox-group" {...props} />;
}
function ComboboxLabel(props: ComboboxPrimitive.GroupLabel.Props) {
  return <ComboboxPrimitive.GroupLabel data-slot="combobox-label" {...props} />;
}
function ComboboxEmpty(props: ComboboxPrimitive.Empty.Props) {
  return <ComboboxPrimitive.Empty data-slot="combobox-empty" {...props} />;
}

function ComboboxItem({
  children,
  className,
  ...props
}: ComboboxPrimitive.Item.Props) {
  return (
    <ComboboxPrimitive.Item
      className={cn('scriptr-ui-combobox__item', className)}
      data-slot="combobox-item"
      {...props}
    >
      {children}
      <ComboboxPrimitive.ItemIndicator>
        <Check />
      </ComboboxPrimitive.ItemIndicator>
    </ComboboxPrimitive.Item>
  );
}

export {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxGroup,
  ComboboxInput,
  ComboboxItem,
  ComboboxLabel,
  ComboboxList,
  ComboboxValue,
};
