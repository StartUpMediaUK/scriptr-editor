import { Monitor, Moon, Settings2, Sun } from 'lucide-react';
import { useState, type CSSProperties } from 'react';
import type { ColourScheme, TimeFormat, TypographyRole } from 'scriptr-editor';
import { useScriptrPresentation } from 'scriptr-editor/react';
import { Button } from '@/components/ui/button';
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

const labels: Record<TypographyRole, [string, string]> = {
  heading: ['Heading font', 'Titles and section headings.'],
  body: ['Body font', 'Paragraphs and the main writing surface.'],
  accent: ['Accent font', 'Text marked with the semantic accent style.'],
  reference: ['Reference font', 'Reference anchors and supporting notes.'],
};
const sizes = [12, 14, 16, 18, 20, 24, 30, 36, 48];

export function SettingsPanel() {
  const { preferences, fonts, themes, cssVariables, update, reset } =
    useScriptrPresentation();
  const [advanced, setAdvanced] = useState(false);
  const updateType = (
    role: TypographyRole,
    patch: { fontId?: string; size?: number },
  ) =>
    update({
      typography: { [role]: { ...preferences.typography[role], ...patch } },
    });
  const typeRow = (role: TypographyRole) => (
    <Field className="gap-3" key={role}>
      <div className="flex flex-col gap-1">
        <FieldLabel>{labels[role][0]}</FieldLabel>
        <FieldDescription>{labels[role][1]}</FieldDescription>
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_6rem] gap-2">
        <Select
          value={preferences.typography[role].fontId}
          onValueChange={(fontId) => fontId && updateType(role, { fontId })}
        >
          <SelectTrigger
            className="w-full min-w-0"
            aria-label={`${labels[role][0]} family`}
          >
            <SelectValue>
              {(fontId: string) =>
                fonts.find((font) => font.id === fontId)?.label ?? fontId
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent align="end">
            <SelectGroup>
              {fonts.map((font) => (
                <SelectItem key={font.id} value={font.id}>
                  {font.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        <Select
          value={String(preferences.typography[role].size)}
          onValueChange={(size) =>
            size && updateType(role, { size: Number(size) })
          }
        >
          <SelectTrigger
            className="w-full"
            aria-label={`${labels[role][0]} size`}
          >
            <SelectValue>{(size: string) => `${size}px`}</SelectValue>
          </SelectTrigger>
          <SelectContent align="end">
            <SelectGroup>
              {sizes.map((size) => (
                <SelectItem key={size} value={String(size)}>
                  {size}px
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>
      <p
        className="m-0 break-words rounded-lg border bg-muted/30 p-3 leading-relaxed"
        style={{
          fontFamily: `var(--scriptr-font-${role})`,
          fontSize: `var(--scriptr-size-${role})`,
        }}
      >
        Scripture, reflection, and thoughtful writing belong together.
      </p>
    </Field>
  );
  return (
    <Sheet>
      <SheetTrigger
        render={
          <Button
            aria-label="Open editor settings"
            size="icon-sm"
            variant="ghost"
          />
        }
      >
        <Settings2 />
      </SheetTrigger>
      <SheetContent
        className="w-full! max-w-lg! gap-0 font-sans"
        data-scriptr-presentation=""
        data-colour-scheme={preferences.colourScheme}
        style={cssVariables as CSSProperties}
      >
        <SheetHeader className="shrink-0 border-b p-5 pr-12">
          <SheetTitle>Editor settings</SheetTitle>
          <SheetDescription>
            Changes apply immediately. Preview each font below.
          </SheetDescription>
        </SheetHeader>
        <ScrollArea className="min-h-0 flex-1">
          <FieldGroup className="gap-7 p-5">
            <Field>
              <FieldLabel>Time format</FieldLabel>
              <Select
                value={preferences.timeFormat}
                onValueChange={(value) =>
                  value && update({ timeFormat: value as TimeFormat })
                }
              >
                <SelectTrigger aria-label="Time format">
                  <SelectValue>
                    {(value: string) =>
                      value === 'system' ? 'System' : value.replace('-', ' ')
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {['system', '12-hour', '24-hour'].map((value) => (
                      <SelectItem key={value} value={value}>
                        {value === 'system'
                          ? 'System'
                          : value.replace('-', ' ')}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel>Colour scheme</FieldLabel>
              <ToggleGroup
                aria-label="Colour scheme"
                className="grid w-full grid-cols-3"
                variant="outline"
                value={[preferences.colourScheme]}
                onValueChange={(values) =>
                  values[0] &&
                  update({ colourScheme: values[0] as ColourScheme })
                }
              >
                {(
                  [
                    ['system', Monitor],
                    ['light', Sun],
                    ['dark', Moon],
                  ] as const
                ).map(([value, Icon]) => (
                  <ToggleGroupItem
                    aria-label={`${value} colour scheme`}
                    className="min-h-11 w-full gap-2"
                    key={value}
                    value={value}
                  >
                    <Icon data-icon="inline-start" />
                    <span>{value[0]!.toUpperCase() + value.slice(1)}</span>
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </Field>
            <Field>
              <FieldLabel>Theme</FieldLabel>
              <FieldDescription>
                Changing theme resets custom font choices.
              </FieldDescription>
              <ToggleGroup
                aria-label="Theme"
                className="grid w-full grid-cols-2"
                variant="outline"
                value={[preferences.themeId]}
                onValueChange={(values) =>
                  values[0] && update({ themeId: values[0] })
                }
              >
                {themes.map((theme) => (
                  <ToggleGroupItem
                    className="h-auto min-h-20 w-full flex-col gap-1 py-3"
                    key={theme.id}
                    value={theme.id}
                  >
                    <span
                      aria-hidden="true"
                      className="text-2xl"
                      style={{
                        fontFamily: fonts.find(
                          (font) => font.id === theme.typography.heading.fontId,
                        )?.family,
                      }}
                    >
                      Aa
                    </span>
                    {theme.label}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </Field>
            <Field>
              <div>
                <FieldLabel>Document contrast</FieldLabel>
                <FieldDescription>
                  Adjust the contrast of the writing and reading surfaces.
                </FieldDescription>
              </div>
              <output>{preferences.contrast}%</output>
              <Slider
                aria-label="Contrast"
                min={50}
                max={150}
                value={[preferences.contrast]}
                onValueChange={(contrast) =>
                  update({
                    contrast:
                      typeof contrast === 'number'
                        ? contrast
                        : (contrast[0] ?? preferences.contrast),
                  })
                }
              />
            </Field>
            <section className="flex flex-col gap-5">
              <header className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="m-0 text-sm font-medium">Typography</h3>
                  <p className="m-0 text-sm text-muted-foreground">
                    Configure the document's font roles.
                  </p>
                </div>
                <FieldLabel className="flex items-center gap-2">
                  Advanced{' '}
                  <Switch checked={advanced} onCheckedChange={setAdvanced} />
                </FieldLabel>
              </header>
              {(['heading', 'body', 'accent'] as const).map(typeRow)}
              {advanced ? typeRow('reference') : null}
            </section>
          </FieldGroup>
        </ScrollArea>
        <div className="shrink-0 border-t p-5">
          <Button onClick={reset} variant="outline">
            Reset settings
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
