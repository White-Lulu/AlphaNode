import MarkdownIt from "./vendor/markdown-it/markdown-it.js";
import * as markModule from "./vendor/markdown-it/markdown-it-mark.js";

const markers={bold:256,highlight:257,escapedBold:258,escapedHighlight:259};

// Allow bold and highlight delimiters to touch Chinese text and full-width punctuation.
function analysisEmphasis(md) {
  md.inline.ruler.before("escape","analysis_emphasis",(state,silent)=>{
    if (silent) return false;
    const source=state.src,start=state.pos,escaped=source[start]==="\\";
    const char=source[start+Number(escaped)];
    if (char!=="*"&&char!=="=") return false;
    const unit=escaped?"\\"+char:char,markup=unit.repeat(2),end=start+markup.length;
    if (end>state.posMax||!source.startsWith(markup,start)||source.startsWith(unit,end)||
      source.slice(start-unit.length,start)===unit) return false;
    const token=state.push("text","",0);
    token.content=escaped?char.repeat(2):markup;
    const marker=char==="*"?(escaped?markers.escapedBold:markers.bold):(escaped?markers.escapedHighlight:markers.highlight);
    state.delimiters.push({marker,length:0,jump:0,token:state.tokens.length-1,
      end:-1,open:end<state.posMax&&/\S/u.test(source[end]),close:start>0&&/\S/u.test(source[start-1])});
    state.pos=end;
    return true;
  });
  md.inline.ruler2.before("emphasis","analysis_emphasis",state=>{
    const groups=[state.delimiters,...state.tokens_meta.filter(Boolean).map(meta=>meta.delimiters??[])];
    for (const delimiters of groups) {
      for (const {marker,end,token} of delimiters) {
        if (marker<markers.bold||marker>markers.escapedHighlight||end<0) continue;
        const tag=marker===markers.bold||marker===markers.escapedBold?"strong":"mark";
        Object.assign(state.tokens[token],{type:tag+"_open",tag,nesting:1,content:""});
        Object.assign(state.tokens[delimiters[end].token],{type:tag+"_close",tag,nesting:-1,content:""});
      }
    }
  });
}

const markdown=new MarkdownIt({html:false}).use(analysisEmphasis).disable("image");
export const renderAnalysis=text=>markdown.render(text);
const legacyMarkdown=new MarkdownIt({html:false}).use(markModule.default??globalThis.markdownitMark).disable("image");
export const renderLegacyAnalysis=text=>legacyMarkdown.render(text);
