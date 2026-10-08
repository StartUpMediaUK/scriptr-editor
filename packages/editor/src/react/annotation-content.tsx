import {
  createContext,
  Fragment,
  useContext,
  useEffect,
  useRef,
  type ReactNode,
} from 'react';
import type { DocumentAnchor } from '../document/anchors.js';
import type { InlineContent } from '../document/types.js';
import type { ExternalAnnotationProps } from './annotations.js';
import { Input } from '../components/ui/input.js';

export const AnnotationContext = createContext<ExternalAnnotationProps>({});
export const FieldNavigationContext = createContext<DocumentAnchor | undefined>(
  undefined,
);
type Region = Pick<DocumentAnchor, 'blockId' | 'itemId' | 'field'>;
export const FieldHistoryContext = createContext<
  { readonly undo: () => void; readonly redo: () => void } | undefined
>(undefined);
export type TextFieldEdit = {
  readonly source: 'input' | 'paste';
  readonly replacement?:
    | { readonly offset: number; readonly length: number }
    | undefined;
};

export function annotationsForRegion(
  region: Region,
  length: number,
  props: ExternalAnnotationProps,
) {
  return props.renderAnnotation
    ? (props.annotations ?? [])
        .filter(
          ({ anchor }) =>
            anchor.blockId === region.blockId &&
            anchor.itemId === region.itemId &&
            anchor.field === region.field &&
            Number.isInteger(anchor.offset) &&
            Number.isInteger(anchor.length) &&
            anchor.offset >= 0 &&
            anchor.length >= 0 &&
            anchor.offset + anchor.length <= length,
        )
        .sort((a, b) => a.anchor.offset - b.anchor.offset)
    : [];
}

export function renderAnnotatedContent(
  content: readonly InlineContent[],
  region: Region,
  props: ExternalAnnotationProps,
  render: (content: readonly InlineContent[]) => ReactNode = (values) =>
    values.map((value, index) =>
      value.type === 'text' ? value.text : <br key={index} />,
    ),
): ReactNode {
  const length = content.reduce(
    (total, value) => total + (value.type === 'text' ? value.text.length : 1),
    0,
  );
  const annotations = annotationsForRegion(region, length, props);
  if (!annotations.length) return render(content);
  const slice = (from: number, to: number) => {
    let offset = 0;
    return content.flatMap((value): InlineContent[] => {
      const size = value.type === 'text' ? value.text.length : 1;
      const start = Math.max(0, from - offset),
        end = Math.min(size, to - offset);
      offset += size;
      return end <= start
        ? []
        : value.type === 'text'
          ? [{ ...value, text: value.text.slice(start, end) }]
          : [value];
    });
  };
  let cursor = 0;
  const output: ReactNode[] = [];
  for (const annotation of annotations) {
    output.push(
      <Fragment key={`text-${annotation.id}`}>
        {render(slice(cursor, annotation.anchor.offset))}
      </Fragment>,
    );
    output.push(
      <span
        key={annotation.id}
        className="scriptr-external-annotation"
        data-scriptr-annotation={annotation.id}
        contentEditable={false}
      >
        {props.renderAnnotation?.(annotation)}
      </span>,
    );
    cursor = annotation.anchor.offset;
  }
  output.push(
    <Fragment key="remaining">{render(slice(cursor, length))}</Fragment>,
  );
  return output;
}

/** Native fields cannot contain decorations; show only non-editable labels beside the input. */
export function AnnotatedFieldInput({
  value,
  region,
  annotationProps,
  onValueChange,
  ...inputProps
}: {
  readonly value: string;
  readonly region: Region;
  readonly annotationProps?: ExternalAnnotationProps | undefined;
  readonly onValueChange: (value: string, edit: TextFieldEdit) => void;
  readonly 'aria-label': string;
  readonly className?: string | undefined;
  readonly placeholder?: string | undefined;
  readonly autoFocus?: boolean | undefined;
}) {
  const inherited = useContext(AnnotationContext);
  const navigation = useContext(FieldNavigationContext);
  const history = useContext(FieldHistoryContext);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (
      navigation?.blockId !== region.blockId ||
      navigation.field !== region.field
    )
      return;
    inputRef.current?.focus();
    inputRef.current?.setSelectionRange(
      navigation.offset,
      navigation.offset + navigation.length,
    );
  }, [navigation, region.blockId, region.field]);
  const props = annotationProps ?? inherited;
  const annotations = annotationsForRegion(region, value.length, props);
  return (
    <>
      {annotations.map((annotation) => (
        <span
          key={annotation.id}
          className="scriptr-external-annotation"
          data-scriptr-annotation={annotation.id}
          contentEditable={false}
        >
          {props.renderAnnotation?.(annotation)}
        </span>
      ))}
      <Input
        {...inputProps}
        ref={inputRef}
        value={value}
        onKeyDown={(event) => {
          if (!history || !(event.metaKey || event.ctrlKey) || event.altKey)
            return;
          const key = event.key.toLowerCase();
          if (key !== 'z' && key !== 'y') return;
          event.preventDefault();
          event.stopPropagation();
          if (key === 'y' || event.shiftKey) history.redo();
          else history.undo();
        }}
        onChange={(event) =>
          onValueChange(event.currentTarget.value, { source: 'input' })
        }
        onPaste={(event) => {
          if (!event.clipboardData.types.includes('text/plain')) return;
          const text = event.clipboardData
            .getData('text/plain')
            .replace(/[\r\n]/g, '');
          const input = event.currentTarget;
          const start = input.selectionStart ?? input.value.length,
            end = input.selectionEnd ?? start;
          event.preventDefault();
          onValueChange(
            input.value.slice(0, start) + text + input.value.slice(end),
            {
              source: 'paste',
              replacement:
                input.value === value
                  ? { offset: start, length: end - start }
                  : undefined,
            },
          );
          queueMicrotask(() => {
            if (input.isConnected)
              input.setSelectionRange(start + text.length, start + text.length);
          });
        }}
      />
    </>
  );
}
