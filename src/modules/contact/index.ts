export {
  getContactMessages,
  resolveContactMessage,
  submitContactMessage,
} from "@/modules/contact/application/contact";
export {
  contactMessageKindLabel,
  CONTACT_MESSAGE_KINDS,
  isSameSitePath,
  type ContactMessageKindName,
} from "@/modules/contact/domain/contact-message";
export {
  contactMessageCreateSchema,
  contactMessageHandleSchema,
  type ContactMessageCreateInput,
  type ContactMessageHandleInput,
} from "@/modules/contact/validation/schemas";
