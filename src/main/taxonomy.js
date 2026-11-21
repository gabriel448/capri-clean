'use strict';

const CATEGORIES = [
  { id: 'games', label: 'Jogos', hint: 'Steam, Epic, GOG, Xbox, Minecraft, ROMs e jogos soltos em qualquer pasta' },
  { id: 'apps', label: 'Aplicativos', hint: 'Programas instalados, portáteis e os dados que eles guardam' },
  { id: 'videos', label: 'Vídeos', hint: 'Filmes, gravações, clipes' },
  { id: 'images', label: 'Imagens', hint: 'Fotos, prints, PSDs, artes' },
  { id: 'audio', label: 'Áudio', hint: 'Músicas, podcasts, samples' },
  { id: 'docs', label: 'Documentos', hint: 'PDFs, Office, textos, planilhas, e-books' },
  { id: 'archives', label: 'Compactados & instaladores', hint: 'ZIP, RAR, 7z, ISO, setups e MSIs soltos' },
  { id: 'dev', label: 'Desenvolvimento', hint: 'node_modules, SDKs, .git, venvs, WSL, Docker, modelos de IA' },
  { id: 'cache', label: 'Cache & temporários', hint: 'Coisas que dá pra limpar sem medo' },
  { id: 'trash', label: 'Lixeira', hint: 'O que você já apagou mas ainda ocupa espaço' },
  { id: 'system', label: 'Sistema', hint: 'Windows, arquivo de paginação, áreas protegidas' },
  { id: 'other', label: 'Outros', hint: 'Arquivos que não se encaixam em nada acima' },
];

const EXT = {};
const put = (cat, list) => list.split(' ').forEach((e) => { EXT[e] = cat; });
put('videos', 'mp4 mkv avi mov wmv flv webm m4v ts mts m2ts 3gp mpg mpeg vob f4v ogv rmvb');
put('images', 'jpg jpeg png gif bmp webp tif tiff heic heif raw cr2 cr3 nef arw dng orf rw2 psd psb svg ico avif jxl xcf kra clip exr hdr');
put('audio', 'mp3 wav flac aac ogg m4a wma opus aiff aif alac mid midi ape wv mka');
put('docs', 'pdf doc docx docm xls xlsx xlsm ppt pptx odt ods odp txt rtf md csv epub mobi azw3 tex pages key numbers one xps djvu cbz cbr');
put('archives', 'zip rar 7z tar gz bz2 xz tgz zst iso img msi msix msixbundle appx appxbundle cab dmg exe apk');
put('games', 'nsp xci rvz wbfs gcm chd cso 3ds cia nds gba gbc gb smc sfc nes n64 z64 v64 pbp');
put('dev', 'vhd vhdx vmdk vdi qcow2 ova ovf gguf safetensors ckpt onnx pt pth');

function extCategory(ext) {
  return EXT[ext] || 'other';
}

module.exports = { CATEGORIES, extCategory };
