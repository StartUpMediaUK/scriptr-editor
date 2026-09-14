import { Slider as SliderPrimitive } from '@base-ui/react/slider';
import { cn } from 'cn';

function Slider({
  className,
  defaultValue,
  value,
  min = 0,
  max = 100,
  ...props
}: SliderPrimitive.Root.Props<number>) {
  const values = [value ?? defaultValue ?? min];

  return (
    <SliderPrimitive.Root
      className={cn('scriptr-ui-slider', className)}
      data-slot="slider"
      defaultValue={defaultValue}
      value={value}
      min={min}
      max={max}
      thumbAlignment="edge"
      {...props}
    >
      <SliderPrimitive.Control className="scriptr-ui-slider__control">
        <SliderPrimitive.Track
          data-slot="slider-track"
          className="scriptr-ui-slider__track"
        >
          <SliderPrimitive.Indicator
            data-slot="slider-range"
            className="scriptr-ui-slider__indicator"
          />
        </SliderPrimitive.Track>
        {values.map((_, index) => (
          <SliderPrimitive.Thumb
            data-slot="slider-thumb"
            key={index}
            className="scriptr-ui-slider__thumb"
          />
        ))}
      </SliderPrimitive.Control>
    </SliderPrimitive.Root>
  );
}

export { Slider };
