#!/usr/bin/env python3
"""Convert a Scrivener document (by title or UUID) to plain text for importing.

Usage:
    python util/scriv_to_text.py "The Embalmers"     # look up title in the binder
    python util/scriv_to_text.py 7585D4D9-...        # or pass a UUID directly
    python util/scriv_to_text.py --raw "Title"       # skip smart-quote normalization
                                                     # (use for zalgo / non-ASCII docs)

Output: paragraphs separated by single newlines, italics as <em>...</em>, RTF
redaction blocks (\\'a8\\'80) as █, and Unicode (combining marks / CJK) preserved.
See designs/scrivener-project-structure.md for the project layout.

Stdlib only. On Windows run with PYTHONUTF8=1 so curly quotes / box chars print.
"""
import sys, re, pathlib, xml.etree.ElementTree as ET

SCRIV = pathlib.Path(r"G:\My Drive\Writing\Writing.scriv")

CODECS = {0: "cp1252", 128: "cp932", 129: "cp949", 134: "gbk", 136: "big5"}


def convert(path):
    s = path.read_text(encoding="latin-1")  # read raw bytes as chars; \'xx are literal
    i, n = 0, len(s)
    out = []                  # output chars
    fonts = {}                # fontnum -> charset
    cur_charset = 0
    uc = 1
    skip = 0                  # unicode fallback chars left to skip
    pend = []                 # pending DBCS bytes
    # group stack of (skip_flag, charset, uc)
    stack = []
    grp_skip = False
    pending_group = False     # just opened a group, next ctrl word may mark destination
    cur_font = 0
    italic = False            # current effective italic state

    def set_italic(val):
        nonlocal italic
        if val == italic:
            return
        if not grp_skip and skip == 0:
            flush_pend()
            out.append("<em>" if val else "</em>")
        italic = val

    def flush_pend():
        nonlocal pend
        if not pend:
            return
        b = bytes(pend); pend = []
        codec = CODECS.get(cur_charset, "cp1252")
        j = 0
        while j < len(b):
            if b[j:j+2] == b"\xa8\x80":      # redaction box marker
                out.append("█"); j += 2; continue
            if codec != "cp1252" and j + 1 < len(b):
                try:
                    out.append(b[j:j+2].decode(codec)); j += 2; continue
                except Exception:
                    pass
            try:
                out.append(b[j:j+1].decode(codec))
            except Exception:
                out.append("�")
            j += 1

    SKIP_DEST = {"fonttbl", "colortbl", "stylesheet", "info", "pict",
                 "shppict", "nisusfilename", "listtable", "listoverridetable",
                 "datastore", "themedata", "colorschememapping"}

    while i < n:
        c = s[i]
        if c == "{":
            flush_pend()
            stack.append((grp_skip, cur_charset, uc, cur_font, italic))
            pending_group = True
            i += 1
            continue
        if c == "}":
            flush_pend()
            if stack:
                grp_skip, cur_charset, uc, cur_font, saved_italic = stack.pop()
                set_italic(saved_italic)   # restore italic state, emitting transition
            pending_group = False
            i += 1
            continue
        if c == "\\":
            # escape or control word
            nxt = s[i+1] if i+1 < n else ""
            if nxt in ("{", "}", "\\"):
                if not grp_skip and skip == 0:
                    flush_pend(); out.append(nxt)
                elif skip > 0:
                    skip -= 1
                i += 2
                pending_group = False
                continue
            if nxt == "'":
                hexs = s[i+2:i+4]
                i += 4
                if skip > 0:
                    skip -= 1
                    continue
                if grp_skip:
                    continue
                try:
                    byte = int(hexs, 16)
                except ValueError:
                    continue
                codec = CODECS.get(cur_charset, "cp1252")
                if codec == "cp1252":
                    flush_pend()
                    out.append(bytes([byte]).decode("cp1252", "replace"))
                else:
                    pend.append(byte)
                continue
            if nxt == "~":           # nbsp
                i += 2
                if skip > 0: skip -= 1
                elif not grp_skip: flush_pend(); out.append(" ")
                continue
            if nxt in ("\n", "\r"):  # \<newline> = line break (paragraph in these docs)
                i += 2
                if not grp_skip and skip == 0:
                    flush_pend(); out.append("\n")
                continue
            # control word
            m = re.match(r"[a-zA-Z]+", s[i+1:])
            if not m:
                i += 2
                pending_group = False
                continue
            word = m.group(0)
            j = i + 1 + len(word)
            num = ""
            if j < n and (s[j] == "-" or s[j].isdigit()):
                k = j
                if s[k] == "-": k += 1
                while k < n and s[k].isdigit(): k += 1
                num = s[j:k]; j = k
            if j < n and s[j] == " ":   # delimiter space consumed
                j += 1
            # mark skip destinations
            if pending_group and (word in SKIP_DEST):
                grp_skip = True
            pending_group = False

            if word == "u":
                i = j
                if grp_skip:
                    skip = uc
                    continue
                flush_pend()
                val = int(num)
                if val < 0: val += 65536
                if skip > 0:
                    # a \u itself shouldn't be skipped normally; emit
                    pass
                out.append(chr(val))
                skip = uc
                continue
            if word == "uc":
                uc = int(num) if num else 1
                i = j; continue
            if word in ("f",):
                cur_font = int(num) if num else 0
                cur_charset = fonts.get(cur_font, 0)
                i = j; continue
            if word == "fcharset":
                fonts[cur_font] = int(num) if num else 0
                cur_charset = fonts[cur_font]
                i = j; continue
            if word in ("par", "line", "pard"):
                if word in ("par", "line") and not grp_skip and skip == 0:
                    flush_pend(); out.append("\n")
                i = j; continue
            if word == "plain":
                set_italic(False)
                i = j; continue
            if word == "i":
                set_italic(num != "0")
                i = j; continue
            # ignore all other control words
            i = j
            continue
        # literal character
        if c in "\r\n":          # bare source newlines are ignored in RTF
            i += 1; continue
        if grp_skip:
            i += 1; continue
        if skip > 0:
            skip -= 1; i += 1; continue
        # U+2028 etc handled as chars; keep
        flush_pend()
        out.append(c)
        i += 1

    flush_pend()
    text = "".join(out)
    return text


def find_uuid(title):
    """UUID of the first Text BinderItem with this title, or None."""
    root = ET.parse(SCRIV / "Writing.scrivx").getroot()
    want = title.strip().lower()

    def walk(node):
        for it in node.findall("BinderItem"):
            if (it.findtext("Title") or "").strip().lower() == want \
                    and it.get("Type") == "Text":
                return it.get("UUID")
            kids = it.find("Children")
            if kids is not None:
                got = walk(kids)
                if got:
                    return got
        return None

    return walk(root.find("Binder"))


def main():
    raw_mode = "--raw" in sys.argv[1:]
    args = [a for a in sys.argv[1:] if a != "--raw"]
    if not args:
        print(__doc__); sys.exit(1)
    ident = args[0]
    if re.fullmatch(r"[0-9A-Fa-f-]{36}", ident):
        uuid = ident
    else:
        uuid = find_uuid(ident)
        if not uuid:
            print("No Text document titled %r" % ident, file=sys.stderr)
            sys.exit(1)
    raw = convert(SCRIV / "Files" / "Data" / uuid / "content.rtf")
    if raw_mode:
        print(raw)
        return
    # normalize cp1252 smart punctuation to ASCII house style
    repl = {"’": "'", "‘": "'", "“": '"', "”": '"',
            "—": "--", "–": "-", "…": "...", " ": " "}
    # keep these only OUTSIDE the zalgo block; apply globally is fine for prose
    for k, v in repl.items():
        raw = raw.replace(k, v)
    print(raw)


if __name__ == "__main__":
    main()
