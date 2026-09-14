import { Toggle as TogglePrimitive } from '@base-ui/react/toggle';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from 'cn';

const toggleVariants = cva('scriptr-ui-toggle', {
  variants: {
    variant: {
      default: 'scriptr-ui-toggle--default',
      outline: 'scriptr-ui-toggle--outline',
    },
    size: {
      default: 'scriptr-ui-toggle--default-size',
      sm: 'scriptr-ui-toggle--sm',
      lg: 'scriptr-ui-toggle--lg',
      icon: 'scriptr-ui-toggle--icon',
    },
  },
  defaultVariants: {
    variant: 'default',
    size: 'default',
  },
});

function Toggle({
  className,
  variant = 'default',
  size = 'default',
  ...props
}: TogglePrimitive.Props & VariantProps<typeof toggleVariants>) {
  return (
    <TogglePrimitive
      data-slot="toggle"
      className={cn(toggleVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Toggle, toggleVariants };
