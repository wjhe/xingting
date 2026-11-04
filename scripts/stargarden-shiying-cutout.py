'''Run the user-provided ShiyingCutout inference engine without changing its files.'''
import argparse
import importlib.abc
import importlib.machinery
import importlib.util
import marshal
import os
from pathlib import Path
import struct
import sys
import zlib

ROOT = Path(__file__).resolve().parent.parent
APP = ROOT / 'ShiyingCutout'
INTERNAL = APP / '_internal'


def archive():
    data = (APP / 'ShiyingCutout.exe').read_bytes()
    cookie_offset = data.rfind(b'MEI\x0c\x0b\x0a\x0b\x0e')
    if cookie_offset < 0:
        raise ValueError('Unrecognized ShiyingCutout archive')
    cookie = struct.unpack('!8sIIII64s', data[cookie_offset:cookie_offset + 88])
    start = cookie_offset + 88 - cookie[1]
    cursor = start + cookie[2]
    end = cursor + cookie[3]
    while cursor < end:
        size, offset, length, _, _, _ = struct.unpack('!IIIIBc', data[cursor:cursor + 18])
        name = data[cursor + 18:cursor + size].split(b'\0')[0].decode('utf-8')
        cursor += size
        if name == 'PYZ.pyz':
            pyz = data[start + offset:start + offset + length]
            toc_offset = struct.unpack('!i', pyz[8:12])[0]
            return pyz, dict(marshal.loads(pyz[toc_offset:]))
    raise ValueError('ShiyingCutout Python archive missing')


class BundledModules(importlib.abc.MetaPathFinder, importlib.abc.Loader):
    def __init__(self, data, toc):
        self.data, self.toc = data, toc

    def find_spec(self, fullname, path=None, target=None):
        if fullname not in self.toc:
            return None
        filesystem_spec = importlib.machinery.PathFinder.find_spec(fullname, path)
        if filesystem_spec is not None and filesystem_spec.loader is not None:
            return None
        kind, _, _ = self.toc[fullname]
        return importlib.util.spec_from_loader(fullname, self, is_package=kind == 1)

    def create_module(self, spec):
        return None

    def exec_module(self, module):
        kind, offset, length = self.toc[module.__name__]
        code = marshal.loads(zlib.decompress(self.data[offset:offset + length]))
        path = INTERNAL.joinpath(*module.__name__.split('.'))
        module.__file__ = str(APP / 'matting_engine.py' if module.__name__ == 'matting_engine' else path.with_suffix('.py'))
        if kind == 1:
            module.__path__ = [str(path)]
        exec(code, module.__dict__)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--probe', action='store_true')
    parser.add_argument('--input', type=Path)
    parser.add_argument('--output', type=Path)
    args = parser.parse_args()
    os.add_dll_directory(str(INTERNAL))
    os.add_dll_directory(str(INTERNAL / 'torch/lib'))
    sys.path.insert(0, str(INTERNAL))
    data, toc = archive()
    sys.meta_path.insert(0, BundledModules(data, toc))
    import matting_engine
    import torch
    print('ShiyingCutout engine loaded; CUDA available:', torch.cuda.is_available(), flush=True)
    if args.probe:
        return
    if args.input is None or args.output is None:
        parser.error('--input and --output are required')
    if args.output.exists():
        raise SystemExit('Output already exists; refusing to overwrite')
    image = matting_engine.open_image(str(args.input))
    result = matting_engine.remove_background(image, refine=True, decontaminate=True,
        progress=lambda value, message: print(f'{value}: {message}', flush=True))
    args.output.parent.mkdir(parents=True, exist_ok=True)
    result.save(args.output, format='PNG')
    print('Saved', args.output, flush=True)


if __name__ == '__main__':
    main()
