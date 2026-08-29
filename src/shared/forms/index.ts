/**
 * 表单组件入口
 * Form Components Entry Point
 *
 * @module shared/forms
 * @description 表单组件统一导出
 *              Unified exports for form components
 */

export { FormField } from "./FormField";
export type { FormFieldProps } from "./FormField";

export { ConsultForm } from "./ConsultForm";
export type { ConsultFormProps } from "./ConsultForm";

export { QualificationFormFields } from "./QualificationFormFields";
export type { QualificationFormFieldsProps, QualificationFormState } from "./QualificationFormFields";
export { INITIAL_QUALIFICATION_FORM, QUAL_FIELDS } from "./QualificationFormFields";
export type { QualFieldKey } from "./QualificationFormFields";
