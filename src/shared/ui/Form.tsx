/**
 * 表单组件集
 * Form Components (shadcn/ui pattern — react-hook-form)
 *
 * @module shared/ui/Form
 * @description 基于 react-hook-form 的表单组件集：
 *              Form（Provider）+ FormField（Controller）+ FormItem +
 *              FormLabel + FormControl + FormMessage。
 *              用法：<Form {...form}><form onSubmit={form.handleSubmit(onSubmit)}>
 *                      <FormField name="x" control={form.control} render={({field}) => (
 *                        <FormItem><FormLabel/><FormControl><Input {...field}/></FormControl><FormMessage/></FormItem>
 *                      )}/>
 *                    </form></Form>
 */

import {
  createContext,
  useContext,
  useId as useReactId,
  forwardRef,
  type HTMLAttributes,
} from "react";
import * as LabelPrimitive from "@radix-ui/react-label";
import { Slot } from "@radix-ui/react-slot";
import {
  Controller,
  FormProvider,
  useFormContext,
  useFormState,
  type ControllerProps,
  type FieldPath,
  type FieldValues,
} from "react-hook-form";
import { cn } from "@/shared/utils";

const Form = FormProvider;

type FormFieldContextValue = { name: string };
const FormFieldContext = createContext<FormFieldContextValue>({} as FormFieldContextValue);
type FormItemContextValue = { id: string };
const FormItemContext = createContext<FormItemContextValue>({} as FormItemContextValue);

function FormField<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
>({ ...props }: ControllerProps<TFieldValues, TName>) {
  return (
    <FormFieldContext.Provider value={{ name: props.name }}>
      <Controller {...props} />
    </FormFieldContext.Provider>
  );
}

function useFormField() {
  const fieldContext = useContext(FormFieldContext);
  const itemContext = useContext(FormItemContext);
  const { getFieldState } = useFormContext();
  const formState = useFormState({ name: fieldContext.name });
  const fieldState = getFieldState(fieldContext.name, formState);
  if (!fieldContext) throw new Error("useFormField 应在 <FormField> 内使用");
  return {
    id: itemContext.id,
    name: fieldContext.name,
    formItemId: `${itemContext.id}-form-item`,
    formMessageId: `${itemContext.id}-form-item-message`,
    ...fieldState,
  };
}

const FormItem = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    // React 内置 useId：SSR 安全（避免 Math.random 导致的水合不匹配）
    const id = `form-item-${useReactId()}`;
    return (
      <FormItemContext.Provider value={{ id }}>
        <div ref={ref} className={cn("space-y-1", className)} {...props} />
      </FormItemContext.Provider>
    );
  },
);
FormItem.displayName = "FormItem";

const FormLabel = forwardRef<
  React.ComponentRef<typeof LabelPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root>
>(({ className, ...props }, ref) => {
  const { error, formItemId } = useFormField();
  return (
    <LabelPrimitive.Root
      ref={ref}
      className={cn(
        "block text-xs font-semibold text-secondary-700",
        error && "text-danger-600",
        className,
      )}
      htmlFor={formItemId}
      {...props}
    />
  );
});
FormLabel.displayName = "FormLabel";

const FormControl = forwardRef<
  React.ComponentRef<typeof Slot>,
  React.ComponentPropsWithoutRef<typeof Slot>
>(({ ...props }, ref) => {
  const { error, formItemId, formMessageId } = useFormField();
  return (
    <Slot
      ref={ref}
      id={formItemId}
      aria-describedby={error ? formMessageId : undefined}
      aria-invalid={!!error}
      {...props}
    />
  );
});
FormControl.displayName = "FormControl";

const FormDescription = forwardRef<HTMLParagraphElement, HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p ref={ref} className={cn("text-xs text-secondary-400", className)} {...props} />
  ),
);
FormDescription.displayName = "FormDescription";

const FormMessage = forwardRef<HTMLParagraphElement, HTMLAttributes<HTMLParagraphElement>>(
  ({ className, children, ...props }, ref) => {
    const { error, formMessageId } = useFormField();
    const body = error ? String(error.message ?? "") : children;
    if (!body) return null;
    return (
      <p
        ref={ref}
        id={formMessageId}
        className={cn("text-xs font-medium text-danger-600", className)}
        {...props}
      >
        {body}
      </p>
    );
  },
);
FormMessage.displayName = "FormMessage";

export {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormDescription,
  FormMessage,
  useFormField,
};
