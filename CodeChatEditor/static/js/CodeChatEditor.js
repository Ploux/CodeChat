// The CodeChat Editor provides a simple IDE which allows editing of mixed code and doc blocks.

"use strict";

// UI
// DOM ready event

const on_dom_content_loaded = on_load_func => {
    if (document.readyState === "loading") {
        // Loading hasn't finished yet.
        document.addEventListener("DOMContentLoaded", on_load_func);
    } else {
        // DOMContentLoaded has already fired.
        on_load_func();
    }
}


// Enums for other options.
const EditorMode = Object.freeze({
    // Display the source code using CodeChat, but disallow editing.
    view: 0,
    // For this source, the same a view; the server uses this to avoid
    //     recursive iframes of the table of contents.
    toc: 1,
    // The full CodeChat editor.
    edit: 2,
    // Show only raw source code; ignore doc blocks, treating them also as
    //     code.
    raw: 3
});


// Load code when the DOM is ready.
const page_init = (source_code, ext) => {
    // Get the mode from the page's query parameters. Default to edit using
    //     the nullish coalescing operator
    const urlParams = new URLSearchParams(window.location.search);
    const mode = EditorMode[urlParams.get("mode")] ?? EditorMode.edit;
    on_dom_content_loaded(() => open_lp(source_code, ext, mode));
};


// This code instantiates editors/viewers for code and doc blocks.
const make_editors = (
    // A instance of the EditorMode enum.
    editorMode
) => {
    // In view mode, don't use TinyMCE, since we already have HTML. Raw mode
    //     doesn't use TinyMCE at all, or even render doc blocks as HTML.
    if (editorMode === EditorMode.edit) {
        // Instantiate the TinyMCE editor for doc blocks.
        tinymce.init({
            // See the <a
            //         href="https://www.tiny.cloud/docs/ui-components/contextmenu/">contextmenu
            //         docs</a> for the default value. TODO: this doesn't work!
        
            contextmenu: "align | forecolor backcolor | bold italic underline superscript subscript codeformat | image link lists table",
            // Place the Tiny MCE menu bar at the top of the screen;
            //     otherwise, it floats in front of text, sometimes obscuring
            //     what the user wants to edit.
            fixed_toolbar_container: "#CodeChat-menu",
            inline: true,
            // I would like to add to this: noneditable paste textpattern
            plugins: 'advlist anchor charmap directionality emoticons help image link lists media nonbreaking pagebreak quickbars searchreplace table visualblocks visualchars',
            // When true, this still prevents hyperlinks to anchors on the
            //     current page from working correctly. There's an onClick
            //     handler that prevents links in the current page from working
            //     -- need to look into this. See also <a
            //         href="https://github.com/tinymce/tinymce/issues/3836">a
            //         related GitHub issue</a>.
            //readonly: true,
            relative_urls: true,
            selector: '.CodeChat-TinyMCE',
            // This combines the <a
            //         href="https://www.tiny.cloud/blog/tinymce-toolbar/">default
            //         TinyMCE toolbar buttons</a> with a few more from plugins.
            // 
            toolbar: 'undo redo | styleselect | bold italic | alignleft aligncenter alignright alignjustify | outdent indent | numlist bullist | ltr rtl | help',
            image_caption: true,
            image_advtab: true,
            image_title: true,
        });
    }

    // The CodeChat Document Editor doesn't include ACE.
    if (window.ace !== undefined) {
        // Instantiate the Ace editor for code blocks.
        ace.config.set('basePath', 'https://cdnjs.cloudflare.com/ajax/libs/ace/1.9.5');
        for (const ace_tag of document.querySelectorAll(".CodeChat-ACE")) {
            ace.edit(ace_tag, {
                // The leading <code>+</code> converts the line number from a
                //     string (since all HTML attributes are strings) to a
                //     number.
                firstLineNumber: +ace_tag.getAttribute("data-CodeChat-firstLineNumber"),
                // This is distracting, since it highlights one line for each
                //     ACE editor instance on the screen. Better: only show this
                //     if the editor has focus.
                highlightActiveLine: false,
                highlightGutterLine: false,
                maxLines: 1e10,
                mode: `ace/mode/${current_language_lexer[0]}`,
                // TODO: this still allows cursor movement. Need something
                //     that doesn't show an edit cursor / can't be selected;
                //     arrow keys should scroll the display, not move the cursor
                //     around in the editor.
                readOnly: editorMode === EditorMode.view || editorMode == EditorMode.toc,
                showPrintMargin: false,
                theme: "ace/theme/textmate",
                wrap: true,
            });
        }
    }

    // Set up for editing the indent of doc blocks.
    for (const td of document.querySelectorAll(".CodeChat-doc-indent")) {
        td.addEventListener("beforeinput", doc_block_indent_on_before_input);
    }
};


// Store the lexer info for the currently-loaded language.
let current_language_lexer;


// True if this is a CodeChat Editor document (not a source file).
const is_doc_only = () => {
    return current_language_lexer[0] === "codechat-html";
};

// Doc block indent editor
// Allow only spaces and delete/backspaces when editing the indent of a doc block.
const doc_block_indent_on_before_input = event => {
    // Only modify the behavior of inserts.
    if (event.data) {
        // Block any insert that's not an insert of spaces. TODO: need to support tabs.
        if (event.data !== " ".repeat(event.data.length)) {
            event.preventDefault();
        }
    }
}

const open_lp = (source_code, extension, mode) => {
    // See if the first line of the file specifies a lexer.
    const m = source_code.match(/^.*CodeChat-lexer:\s*(\w+)/);
    const lexer_name = m ? m[1] : "";
    let found = false;
    for (current_language_lexer of language_lexers) {
        // If the source code provided a lexer name, match only on that;
        //     otherwise, match based on file extension.
        if ((current_language_lexer[0] === lexer_name) || (!lexer_name && current_language_lexer[1].includes(extension))) {
            found = true;
            break;
        }
    }
    console.assert(found, "Unable to determine which lexer to use for this language.");
    // Special case: a CodeChat Editor document's HTML doesn't need lexing.
    let html;
    if (is_doc_only()) {
        html = `<div class="CodeChat-TinyMCE">${source_code}</div>`;
    } else {
        const classified_lines = source_lexer(source_code, ...current_language_lexer);
        html = classified_source_to_html(classified_lines);
    }

    document.getElementById("CodeChat-body").innerHTML = html;
    // Initialize editors for this new content.
    make_editors(mode);
};

const on_save_as = async on_save_func => {
    // TODO!
    msg = "Save as is not implemented.";
    window.alert(msg);
    throw msg;
};

// Save CodeChat Editor contents.
const on_save = async () => {
    // Pick an inline comment from the current lexer. TODO: support block
    //     comments (CSS, for example, doesn't allow inline comment).
    const inline_comment = current_language_lexer[2][0];
    // This is the data to write &mdash; the source code.
    const source_code = editor_to_source_code(inline_comment);
    await save(source_code);
};


// Choose between control and command key for Apple
const os_is_osx = (navigator.platform.indexOf("Mac") === 0 || navigator.platform === "iPhone") ? true : false;

// Provide a shortcut of ctrl-s (or command-s) to save the current file.
const on_keydown = (event) => {
    if ((event.key === "s") && ((event.ctrlKey && !os_is_osx) || (event.metaKey && os_is_osx)) && !event.altKey) {
        on_save();
        event.preventDefault();
    }
}

// <a id="save"></a>Save the provided contents back to the filesystem, by
//     sending a <code>PUT</code> request to the server. See the <a
//         href="CodeChatEditorServer.v.html#save_file">save_file endpoint</a>.
// 
const save = async contents => {
    let response;
    try {
        response = await window.fetch(window.location, {
            method: "PUT",
            body: contents,
        });
    } catch (error) {
        window.alert(`Save failed -- ${error}.`);
        return;
    }
    if (response.ok) {
        const response_body = await response.json()
        if (response_body.success !== true) {
            window.alert("Save failed.");
        }
        return;
    }
    window.alert(`Save failed -- server returned ${response.status}, ${response.statusText}.`);
};


// Load editor contents from source code
// This process is split between two functions: first, <a
//         href="#source_lexer">split the source code into code blocks and doc
//         blocks</a>; next, <a href="#classified_source_to_html">transform this
//         into its web-editable form</a>.
// Both the load and save routines need information about the programming
//     language in order to load/save code in that language.
const language_lexers = [
    // <dl>
    //     <dt>IC</dt>
    //     <dd>inline comment</dd>
    //     <dt>Heredoc</dt>
    //     <dd>Here document: an array of <code>[start prefix string, start
    //             body regex, start suffix string, stop prefix string, stop
    //             suffix string]</code>.</dd>
    //     <dt>JS tmpl lit</dt>
    //     <dd>JavaScript template literal: 0 = Language is not JavaScript, 1 =
    //         Language is JavaScript. (2 = inside a template literal should
    //         only be used by the lexer itself).</dd>
    // </dl>
    // C++11 or newer. Don't worry about supporting C or older C++ using
    //     another lexer entry, since the raw string syntax in C++11 and newer
    //     is IMHO so rare we won't encounter it in older code. See the <a
    //         href="https://en.cppreference.com/w/cpp/language/string_literal">C++
    //         string literals docs</a> for the reasoning behind the start body
    //     regex.
    //Language name File extensions     IC      Block comment       Long string     Short str   Heredoc JS tmpl lit
    ["c_cpp",       [".cc", ".cpp"],    ["//"], [["/*", "*/"]],     [],             ['"'],      [['R"', "[^()\\ ]", "(", ")", ""]], 0],
    ["html",        [".html"],          [],     [["<!--", "-->"]],  [],             [],         [],     0],
    ["javascript",  [".js"],            ["//"], [["/*", "*/"]],     [],             ['"', "'"], [],     1],
    ["python",      [".py"],            ["#"],  [],                 ['"""', "'''"], ['"', "'"], [],     0],
    ["verilog",     [".v"],             ["//"], [["/*", "*/"]],     [],             ['"'],      [],     0],
    ["vlang",       [".v"],             ["//"], [["/*", "*/"]],     [],             ['"', "'"], [],     0],
    ["codechat-html", [".cchtml"],      [""],   [],                 [],             [],         [],     0],
];


// Source lexer
// Rather than attempt to lex the entire language, this lexer's only goal is
//     to categorize all the source code into code blocks or doc blocks. To do
//     it, it only needs to:
// <ul>
//     <li>Recognize where comments can't be&mdash;inside strings, <a
//             href="https://en.wikipedia.org/wiki/Here_document">here text</a>,
//         or <a
//             href="https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Template_literals">template
//             literals</a>. These are always part of a code block and can never
//         contain a comment or (by implication) a doc block.</li>
//     <li>Outside of these special cases, look for inline or block comments,
//         categorizing everything else as code.</li>
//     <li>After finding either an inline or block comment, determine if this is
//         a doc block.</li>
// </ul>
// It returns a list of <code>indent, string, indent_type</code> where:
// <dl>
//     <dt><code>indent</code></dt>
//     <dd>The indent of a doc block (a string of whitespace), or
//         <code>null</code> for a code block.</dd>
//     <dt><code>string</code></dt>
//     <dd>The classified string; for doc blocks, this does not include the
//         indenting spaces or the inline/block comment prefix/suffix</dd>
//     <dt><code>indent_type</code></dt>
//     <dd>The comment string for a doc block, or "" for a code block.</dd>
// </dl>
const source_lexer = (
    source_code,
    language_name,
    extension_strings,
    inline_comment_strings,
    block_comment_strings,
    long_string_strings,
    short_string_strings,
    here_text_strings,
    template_literals,
) => {
    // Construct <a
    //         href="https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_Expressions">regex</a>
    //     and associated indices from language information provided.
    //     <strong>This code makes heavy use of regexes -- read the previous
    //         link thoroughly.</strong>
    let regex_index = 1;
    let regex_strings = [];
    const regex_builder = (strings) => {
        // Look for a non-empty array. Note that <code>[]</code> is
        //     <code>true</code>.
        if (strings.length) {
            regex_strings.push(
                // Escape any regex characters in these strings.
                strings.map(escapeRegExp).join("|")
            );
            return regex_index++;
        }
        return null;
    }
    // Order these by length of the expected strings, since the regex with an
    //     or expression will match left to right.
    // Include only the opening block comment string (element 0) in the
    //     regex.
    let block_comment_index = regex_builder(block_comment_strings.map(element => element[0]));
    let long_string_index = regex_builder(long_string_strings);
    let inline_comment_index = regex_builder(inline_comment_strings);
    let short_string_index = regex_builder(short_string_strings);
    // Template literals only exist in JavaScript. No other language (that I
    //     know of) allows comments inside these, or nesting of template
    //     literals.
    let template_literal_index = null;
    if (template_literals) {
        // If inside a template literal, look for a nested template literal
        //     (<code>`</code>) or the end of the current expression
        //     (<code>}</code>).
        regex_strings.push(template_literals === 1 ? "`" : "`|}");
        template_literal_index = regex_index++;
    }
    let classify_regex = new RegExp("(" + regex_strings.join(")|(") + ")");

    let classified_source = [];
    // An accumulating array of strings composing the current code block.
    let code_block_array = [];
    while (source_code.length) {
        // Look for either a comment or a no-comment zone.
        const m = source_code.match(classify_regex);
        if (m) {
            // Add everything preceding this match to the current code block.
            // 
            code_block_array.push(source_code.substring(0, m.index));
            source_code = source_code.substring(m.index);
            // Figure out which matched.
            if (inline_comment_index && m[inline_comment_index]) {
                // A comment matched.
                const inline_comment_string = m[inline_comment_index];
                // Look at the last line of code by examining the code block
                //     being accumulated.
                let code_block = code_block_array.join("");
                const split_lines = code_block.split(/\n|\r\n|\r/)
                // If there's no matching newline, we're at the beginning of
                //     the uncategorized source code.
                const last_line = split_lines ? split_lines[split_lines.length - 1] : "";

                // Find the end of this comment. No matching newline means
                //     we're at the end of the file. Note that using a negative
                //     lookbehind assertion would make this much simpler:
                //     <code>/(?&lt;!\\)(\n|\r\n|\r)/</code>. However, V doesn't
                //     support this.
                const inline_m = source_code.match(/(\\\r\n|\\\n|\\\r|[^\\\n\r])*(\n|\r\n|\r)/);
                const full_comment = inline_m ? source_code.substring(0, inline_m.index + inline_m[0].length) : source_code;

                // Criteria for doc blocks for an inline comment:
                // <ul>
                //     <li>All characters preceding the comment on the current
                //         line must be whitespace.</li>
                //     <li>Either:
                //         <ul>
                //             <li>The comment is immediately followed by a
                //                 space, or</li>
                //             <li>the comment is followed by a newline or the
                //                 end of file.</li>
                //         </ul>
                //     </li>
                // </ul>
                // Doc block comments have a space after the comment string
                //     or are empty, and only spaces before the comment.
                if ((full_comment.startsWith(inline_comment_string + " ") || full_comment === inline_comment_string + (inline_m ? inline_m[1] : "")) && last_line.match(/^\s*$/)) {
                    // Transition from a code block to this doc block.
                    code_block = code_block.substring(0, code_block.length - last_line.length)
                    if (code_block) {
                        // Save only code blocks with some content.
                        classified_source.push([null, code_block, ""]);
                    }
                    code_block_array = [];
                    // Add this doc block.
                    const has_space_after_comment = full_comment[inline_comment_string.length] === " ";
                    classified_source.push([last_line, full_comment.substring(inline_comment_string.length + (has_space_after_comment ? 1 : 0)), inline_comment_string]);
                } else {
                    // This is still code.
                    code_block_array.push(full_comment);
                }
                // Move to the next block of source code to be lexed.
                source_code = source_code.substring(full_comment.length);
            } else if (block_comment_index && m[block_comment_index]) {
                // A block comment matched.
                const block_comment_string = m[block_comment_index];
                // Find the end of this comment. No matching newline means
                //     we're at the end of the file.
                const block_m = source_code.match(new RegExp(escapeRegExp(block_comment_string[1]) + "|" + escapeRegExp(block_comment_string[0])));
                const full_comment = block_m ? source_code.substring(0, block_m.index + block_m[0].length) : source_code;
                // Add this block comment.
                classified_source.push([null, full_comment, block_comment_string[0]]);
                // Move to the next block of source code to be lexed.
                source_code = source_code.substring(full_comment.length);
               
                // TODO!
                // const msg = "Block comments not implemented.";
                // window.alert(msg);
                // throw msg;
            } else if (long_string_index && m[long_string_index]) {
                // A long string. Find the end of it.
                code_block_array.push(m[long_string_index]);
                source_code = source_code.substring(m[long_string_index].length);
                const string_m = source_code.match(m[long_string_index]);
                // Add this to the code block, then move forward. If it's not
                //     found, the quote wasn't properly closed; add the rest of
                //     the code.
                if (string_m) {
                    const index = string_m.index + string_m[0].length;
                    code_block_array.push(source_code.substring(0, index));
                    source_code = source_code.substring(index);
                } else {
                    code_block_array.push(source_code);
                    source_code = "";
                }
            } else if (short_string_index && m[short_string_index]) {
                // A short string. Find the end of it.
                code_block_array.push(m[short_string_index]);
                source_code = source_code.substring(m[short_string_index].length);
                const string_m = source_code.match(
                    // Use <a
                    //         href="https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/raw"><code>String.raw</code></a>
                    //     so we don't have to double the number of backslashes
                    //     in this regex. Joining regex literals doesn't work
                    //     &ndash; <code>/.a/ +
                    //         /b/</code> produces the string
                    //     <code>'/.a//b/'</code>, not a regex. The regex is:
                    // 
                    // Look for anything that doesn't terminate a string:
                    "(" +
                        // a backslash followed by a newline (in all three
                        //     newline styles);
                        String.raw`\\\r\n|\\\n|\\\r|` +
                        // a backslash followed by any non-newline character
                        //     (note that the <code>.</code> character class <a
                        //         href="https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_Expressions/Character_Classes#types">doesn't
                        //         match newlines</a>; using the <code>s</code>
                        //     or <code>dotAll</code> flag causes it to match <a
                        //         href="https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Lexical_grammar#line_terminators">line
                        //         terminators</a> that we don't recognize, plus
                        //     not match a <code>\r\n</code> sequence);
                        String.raw`\\.|` +
                        // anything that's not a backslash, quote mark, or
                        //     newline.
                        String.raw`[^\\${m[short_string_index]}\n\r]` +
                    // Find as many of these as possible. Therefore, the next
                    //     token will be the end of the string.
                    ")*" +
                    // A string is terminated by either a quote mark or a
                    //     newline. (We can't just put <code>.</code>, because
                    //     one flavor of newline is two characters; in addition,
                    //     that character class doesn't match newlines, as
                    //     stated above.) Terminating strings at a newline helps
                    //     avoid miscategorizing large chunks of code that the
                    //     compiler likewise flags as a syntax error.
                    String.raw`(${m[short_string_index]}|\r\n|\n|\r)`
                );
                if (string_m) {
                    const index = string_m.index + string_m[0].length;
                    code_block_array.push(source_code.substring(0, index));
                    source_code = source_code.substring(index);
                } else {
                    code_block_array.push(source_code);
                    source_code = "";
                }
            } else if (template_literal_index && m[template_literal_index]) {
                // TODO! For now, just assume there's no comments in
                //     here...dangerous!!!
                code_block_array.push(m[template_literal_index]);
                source_code = source_code.substring(m[template_literal_index].length);
            } else {
                console.assert(false);
                debugger;
            }
        } else {
            // The rest of the source code is in the code block.
            code_block_array.push(source_code);
            source_code = "";
        }
    }

    // Include any accumulated code in the classification.
    const code = code_block_array.join("")
    if (code) {
        classified_source.push([null, code, ""]);
    }

    return classified_source;
};


// <h2 id="classified_source_to_html">Convert lexed code into HTML
const classified_source_to_html = (classified_source) => {
    // An array of strings for the new content of the current HTML page.
    let html = [];

    // Keep track of the current type. Begin with neither comment nor code.
    // 
    let current_indent = -2

    // Keep track of the current line number.
    let line = 1

    for (let [indent, source_string, comment_string] of classified_source) {
        // <span id="newline-movement">In a code or doc block, omit the last
        //         newline; otherwise, code blocks would show an extra newline
        //         at the end of the block. (Doc blocks ending in a
        //         <code>&lt;pre&gt;</code> tag or something similar would also
        //         have this problem). To do this, remove the newline from the
        //         end of the current line, then prepend it to the beginning of
        //         the next line.</span>
        const m = source_string.match(/(\n|\r\n|\r)$/);
        if (m) {
            source_string = source_string.substring(0, m.index);
        }

        // See if there's a change in state.
        if (current_indent !== indent) {
            // Exit the current state.
            _exit_state(current_indent, html)

            // Enter the new state.
            if (indent === null) {
                // Code state: emit the beginning of an ACE editor block.
                html.push(
`
<div class="CodeChat-code">
    <div class="CodeChat-ACE" data-CodeChat-firstLineNumber="${line}">`,
                    escapeHTML(source_string),
                )

            } else {
                // Comment state: emit an opening indent for non-zero
                //     indents; insert a TinyMCE editor.
                // <span id="one-row-table">Use a one-row table to lay out a
                //         doc block, so that it aligns properly with a code
                //         block.</span>
                html.push(
`<div class="CodeChat-doc">
    <table>
        <tbody>
            <tr>
                <!-- Spaces matching the number of digits in the ACE gutter's line number. TODO: fix this to match the number of digits of the last line of the last code block. Fix ACE to display this number of digits in all gutters. See https://stackoverflow.com/questions/56601362/manually-change-ace-line-numbers. -->
                <td class="CodeChat-ACE-gutter-padding ace_editor">&nbsp;&nbsp;&nbsp</td>
                <td class="CodeChat-ACE-padding"></td>
                <!-- This doc block's indent. TODO: allow paste, but must only allow pasting spaces. -->
                <td class="ace_editor CodeChat-doc-indent" contenteditable onpaste="return false">${indent}</td>
                <td class="CodeChat-TinyMCE-td"><div class="CodeChat-TinyMCE">`,
                    source_string,
                )
            }
        } else {
            // <span id="newline-prepend"><a href="#newline-movement">Newline
            //             movement</a>: prepend the newline removed from the
            //         previous line to the current line</span>.
            html.push(m[0], indent === null ? escapeHTML(source_string) : source_string);
        }

        // Update the state.
        current_indent = indent
        // There are an unknown number of newlines in this source string. One
        //     was removed <a href="#newline-movement">here</a>, so include that
        //     in the count.
        line += 1 + (source_string.match(/\n|\r\n|\r/g) || []).length
    }

    // When done, exit the last state.
    _exit_state(current_indent, html)
    return html.join("");
};


// _exit_state
// Output text produced when exiting a state. Supports <a
//         href="#_generate_web_editable"><code>_generate_web_editable</code></a>.
// 
const _exit_state = (
    // The type (classification) of the last line.
    indent,
    // An array of string to store output in.
    html,
) => {

    if (indent === null) {
        // Close the current code block.
        html.push("</div>\n</div>\n");
    } else if (typeof indent === "string") {
        // Close the current doc block without adding any trailing spaces
        //     &mdash; combining this with the next line would add indentation.
        // 
        //
        html.push(
`</td>
            </tr>
        </tbody>
    </table>
</div>
`
        )
    }
}


// Save editor contents to source code
// This transforms the current editor contents into source code.
const editor_to_source_code = (
    // A string specifying the comment character(s) for the current
    //     programming language. A space will be added after this string before
    //     appending a line of doc block contents.
    comment_string
) => {
    // Walk through each code and doc block, extracting its contents then
    //     placing it in <code>classified_lines</code>.
    let classified_lines = [];
    for (const code_or_doc_tag of document.querySelectorAll(".CodeChat-ACE, .CodeChat-TinyMCE")) {
        // The type of this block: <code>null</code> for code, or &gt;= 0 for
        //     doc (the value of n specifies the indent in spaces).
        let indent;
        // A string containing all the code/docs in this block.
        let full_string;

        // Get the type of this block and its contents.
        if (code_or_doc_tag.classList.contains("CodeChat-ACE")) {
            indent = null;
            full_string = ace.edit(code_or_doc_tag).getValue();
        } else if (code_or_doc_tag.classList.contains("CodeChat-TinyMCE")) {
            // Get the indent from the previous table cell. For a CodeChat
            //     Editor document, there's no indent (it's just a doc block).
            // 
            indent = is_doc_only() ? null : code_or_doc_tag.parentElement.previousElementSibling.textContent;
            // See <a
            //         href="https://www.tiny.cloud/docs/tinymce/6/apis/tinymce.root/#get"><code>get</code></a>
            //     and <a
            //         href="https://www.tiny.cloud/docs/tinymce/6/apis/tinymce.editor/#getContent"><code>getContent()</code></a>.
            //     Fortunately, it looks like TinyMCE assigns a unique ID if
            //     one's no provided, since it only operates on an ID instead of
            //     the element itself.
            full_string = tinymce.get(code_or_doc_tag.id).getContent();
            // The HTML from TinyMCE is a mess! Wrap at 80 characters,
            //     including the length of the indent and comment string.
            full_string = html_beautify(full_string, { "wrap_line_length": 80 - (indent || "").length - comment_string.length - 1 });
        } else {
            console.assert(false, `Unexpected class for code or doc block ${code_or_doc_tag}.`);
        }

        // Split the <code>full_string</code> into individual lines; each one
        //     corresponds to an element of <code>classified_lines</code>.
        for (const string of full_string.split(/\r?\n/)) {
            classified_lines.push([indent, string + "\n"]);
        }
    }

    // Transform these classified lines into source code.
    let lines = [];
    for (const [indent, string] of classified_lines) {
        if (indent === null) {
            // Just dump code out! Or a CodeChat Editor document, where the
            //     indent doesn't matter.
            lines.push(string);
        } else {
            // Prefix comments with the indent and the comment string.
            // TODO: allow the use of block comments.
            lines.push(`${indent}${comment_string} ${string}`);
        }
    }

    return lines.join("");
};


// Helper functions
// Given text, escape it so it formats correctly as HTML. Because the
//     solution at https://stackoverflow.com/a/48054293 transforms newlines into
//     <br>(see
//     https://developer.mozilla.org/en-US/docs/Web/API/HTMLElement/innerText),
//     it's not usable with code. Instead, this is a translation of Python's
//     <code>html.escape</code> function.
const escapeHTML = unsafeText => {
    // Must be done first!
    unsafeText = unsafeText.replaceAll("&", "&amp;")
    unsafeText = unsafeText.replaceAll("<", "&lt;")
    unsafeText = unsafeText.replaceAll(">", "&gt;")
    return unsafeText;
};


// This function comes from the <a
//         href="https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_Expressions#escaping">MDN
//         docs</a>.
const escapeRegExp = string => string.replace(/[.*+?^${}()|[\]\\]/g,
    // <code>$&amp;</code> means the whole matched string.
    '\\$&');


// Unit tests
// TODO!
const test_source_lexer_1 = () => {
    const python_source_lexer = source_code => source_lexer(source_code, ...language_lexers[3]);
    assert_equals(python_source_lexer(""), []);
    assert_equals(python_source_lexer("\n"), [[null, "\n", ""]]);
    assert_equals(python_source_lexer("\n# Test"), [[null, "\n", ""], ["", "Test", "#"]]);
    assert_equals(python_source_lexer("\n# Test\n"), [[null, "\n", ""], ["", "Test\n", "#"]]);
    assert_equals(python_source_lexer("# Test"), [["", "Test", "#"]]);
    assert_equals(python_source_lexer("# Test\n"), [["", "Test\n", "#"]]);
    assert_equals(python_source_lexer("# Test\n\n"), [["", "Test\n", "#"], [null, "\n", ""]]);
    // Short string with line join.
    assert_equals(python_source_lexer("'\\\n# Test'\n"), [[null, "'\\\n# Test'\n", ""]]);
    assert_equals(python_source_lexer('"\\\n# Test"\n'), [[null, '"\\\n# Test"\n', ""]]);
    // Short string terminated with newline (syntax error) followed by a
    //     comment.
    assert_equals(python_source_lexer("'\\\\\n# Test'\n"), [[null, "'\\\\\n", ""], ["", "Test'\n", "#"]]);
    assert_equals(python_source_lexer('"\\\\\n# Test"\n'), [[null, '"\\\\\n', ""], ["", 'Test"\n', "#"]]);
    // Long string with newlines around comment.
    assert_equals(python_source_lexer('"""\n# Test\n"""'), [[null, '"""\n# Test\n"""', ""]]);
    assert_equals(python_source_lexer("'''\n# Test\n'''"), [[null, "'''\n# Test\n'''", ""]]);
    // Unterminated long strings.
    assert_equals(python_source_lexer('"""\n# Test\n'), [[null, '"""\n# Test\n', ""]]);
    assert_equals(python_source_lexer("'''\n# Test\n"), [[null, "'''\n# Test\n", ""]]);
    // Comments that aren't doc blocks.
    assert_equals(python_source_lexer("  a = 1 # Test"), [[null, "  a = 1 # Test", ""]]);
    assert_equals(python_source_lexer("\n  a = 1 # Test"), [[null, "\n  a = 1 # Test", ""]]);
    assert_equals(python_source_lexer("  a = 1 # Test\n"), [[null, "  a = 1 # Test\n", ""]]);
    // Doc blocks.
    assert_equals(python_source_lexer("   # Test"), [["   ", "Test", "#"]]);
    assert_equals(python_source_lexer("\n   # Test"), [[null, "\n", ""], ["   ", "Test", "#"]]);

    assert_equals(python_source_lexer("   # Test\n"), [["   ", "Test\n", "#"]]);
};


const test_source_lexer = () => {
    test_source_lexer_1();
};


// Woefully inadequate, but enough for testing.
const assert_equals = (a, b) => {
    console.assert(a.length === b.length);
    for (let index = 0; index < a.length; ++index) {
        if (a[index] instanceof Array) {
            console.assert(b[index] instanceof Array);
            assert_equals(a[index], b[index]);
        } else {
            console.assert(a[index] === b[index]);
        }
    }
}


test_source_lexer();
