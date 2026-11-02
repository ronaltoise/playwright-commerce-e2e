/** Where a build's saved admin session lives. `stable-setup`, `stable` and `stable-mobile` share one. */
export const adminStatePath = (projectName: string): string => `e2e/.auth/${projectName.split('-')[0]}-admin.json`;
