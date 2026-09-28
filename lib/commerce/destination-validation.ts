import { z } from "zod";

const required = (max: number) => z.string().trim().min(1).max(max);
export const DestinationInput = z.object({
  id: z.string().uuid().optional(),
  label: required(80),
  countryCode: z.string().trim().regex(/^[A-Za-z]{2}$/).transform((value) => value.toUpperCase()),
  city: required(120),
  addressLine1: required(200),
  addressLine2: z.string().trim().max(200).optional(),
  contactName: required(120),
  contactPhone: z.string().trim().regex(/^\+[1-9][0-9]{6,14}$/),
  deliveryMethod: z.literal("Courier"),
  isDefault: z.boolean(),
});
export type DestinationInput = z.infer<typeof DestinationInput>;
export type Destination = DestinationInput & { id: string };
