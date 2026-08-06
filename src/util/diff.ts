import { createTwoFilesPatch } from "diff"

export function unifiedDiff(oldContent: string, newContent: string, fileName: string): string {
  if (oldContent === newContent) return ""
  return createTwoFilesPatch(fileName, fileName, oldContent, newContent, "", "", {
    context: 3,
  })
}
