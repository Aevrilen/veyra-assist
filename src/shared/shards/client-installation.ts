import { z } from 'zod'

export const clientLaunchConfigurationSchema = z
  .object({
    client: z.enum(['tcls', 'wegame', 'riot']),
    executablePath: z.string().min(1)
  })
  .strict()

export type ClientLaunchConfiguration = z.infer<typeof clientLaunchConfigurationSchema>
export type ClientLaunchValidation = 'valid' | 'invalid-path' | 'unsupported-platform'
export type ClientLaunchResult =
  Exclude<ClientLaunchValidation, 'valid'> | 'started' | 'already-starting'
