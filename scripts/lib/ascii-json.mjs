// JSON with every non-ASCII character written as a \uXXXX escape.
//
// The generated .sql files are pasted into the Supabase SQL Editor. Copying through a tool that
// guesses the wrong encoding (pbcopy in a Terminal without a UTF-8 locale reads bytes as Mac Roman)
// turns Hindi names into text like "‡§∏‡•ç‡§™‡§∞‡•ç‡§∂". Pure ASCII survives any copy, and jsonb decodes
// the escapes back into the original characters.
export function asciiJson(value) {
  return JSON.stringify(value).replace(/[\u007f-￿]/g, c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'))
}
