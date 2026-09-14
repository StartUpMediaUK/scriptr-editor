import { Button as ButtonPrimitive } from '@base-ui/react/button';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from 'cn';

const buttonVariants = cva('scriptr-ui-button', {
  variants: {
    variant: {
      default: 'scriptr-ui-button--default',
      destructive: 'scriptr-ui-button--destructive',
      outline: 'scriptr-ui-button--outline',
      secondary: 'scriptr-ui-button--secondary',
      ghost: 'scriptr-ui-button--ghost',
      link: 'scriptr-ui-button--link',
      'muted-link': 'scriptr-ui-button--muted-link',
      'ghost-no-hover': 'scriptr-ui-button--ghost-no-hover',
    },
    size: {
      default: 'scriptr-ui-button--size-default',
      xs: 'scriptr-ui-button--size-xs',
      sm: 'scriptr-ui-button--size-sm',
      lg: 'scriptr-ui-button--size-lg',
      icon: 'scriptr-ui-button--size-icon',
      'icon-xs': 'scriptr-ui-button--size-icon-xs',
      'icon-sm': 'scriptr-ui-button--size-icon-sm',
      'icon-lg': 'scriptr-ui-button--size-icon-lg',
      ghost: 'scriptr-ui-button--size-ghost',
      inline: 'scriptr-ui-button--size-inline',
    },
  },
  defaultVariants: {
    variant: 'default',
    size: 'default',
  },
});

function Button({
  className,
  variant = 'default',
  size = 'default',
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
