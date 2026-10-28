import type { ComponentType } from "react";
import type { BackLinkProps, CardProps, ChipProps, ScoreProps } from "./ui";
import type { IconSubmitProps, SubmitProps } from "./Submit";
import type { InfoTipProps, TipProps } from "./Tip";
import type {
  ButtonProps,
  SelectProps,
  TextAreaProps,
  TextInputProps,
} from "./Controls";

/**
 * The pieces Evalkeeper's screens are built from. Name any of them in
 * `lib/evalkeeper/appComponents.ts` to draw the screens with your app's own;
 * the rest stay Evalkeeper's. Pieces that use state or form status
 * (Submit, IconSubmit, and usually the controls) must be client
 * components.
 */
export type EvalComponents = {
  Card: ComponentType<CardProps>;
  Chip: ComponentType<ChipProps>;
  BackLink: ComponentType<BackLinkProps>;
  Score: ComponentType<ScoreProps>;
  Submit: ComponentType<SubmitProps>;
  IconSubmit: ComponentType<IconSubmitProps>;
  Spinner: ComponentType;
  Tip: ComponentType<TipProps>;
  InfoTip: ComponentType<InfoTipProps>;
  Button: ComponentType<ButtonProps>;
  TextInput: ComponentType<TextInputProps>;
  TextArea: ComponentType<TextAreaProps>;
  Select: ComponentType<SelectProps>;
};
