import { createCn } from "cn/config"

/**
 * Class merging for Tailwind. The dense font sizes declared in globals.css
 * (text-2xs ... text-5xs) are registered so `cn` treats them as font sizes:
 * without this it reads `text-2xs` as a colour and drops it next to one.
 */
export const cn = createCn({
  extend: { theme: { text: ["2xs", "3xs", "4xs", "5xs"] } },
})
