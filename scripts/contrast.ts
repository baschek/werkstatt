import { TEXT_PAIRS, contrast } from '../src/ui/tokens'
for (const [fg, bg, name] of TEXT_PAIRS) console.log(contrast(fg, bg).toFixed(2).padStart(6), fg, 'auf', bg, '-', name)
