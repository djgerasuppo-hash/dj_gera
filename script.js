const supportedLanguages = ['en', 'es'];
const defaultLanguage = 'en';
let currentLanguage = localStorage.getItem('djger-language') || defaultLanguage;
const contents = {};
let links = {};

async function fetchProperties(url) {
  const response = await fetch(url);
  const text = await response.text();
  return parseProperties(text);
}

function parseProperties(text) {
  const lines = text.split(/\r?\n/);
  const data = {};
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }
    const separator = trimmed.indexOf('=');
    if (separator < 0) continue;
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim();
    data[key] = value;
  }
  return data;
}

function getContentFile(language) {
  return `static/content.${language}.properties`;
}

async function loadContents() {
  await Promise.all(
    supportedLanguages.map(async (lang) => {
      try {
        contents[lang] = await fetchProperties(getContentFile(lang));
      } catch (error) {
        console.warn(`No se pudo cargar contenido para ${lang}:`, error);
        contents[lang] = {};
      }
    })
  );
}

async function loadLinks() {
  try {
    links = await fetchProperties('static/links.properties');
  } catch (error) {
    console.warn('No se pudo cargar links.properties:', error);
    links = {};
  }
}

function getYoutubeEmbedUrl(url) {
  if (!url) return null;
  const patterns = [
    /(?:https?:\/\/)?(?:www\.)?youtube\.com\/watch\?v=([^&?\/\s]+)/i,
    /(?:https?:\/\/)?(?:www\.)?youtube\.com\/embed\/([^&?\/\s]+)/i,
    /(?:https?:\/\/)?youtu\.be\/([^&?\/\s]+)/i
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match && match[1]) {
      return `https://www.youtube.com/embed/${match[1]}?rel=0`;
    }
  }
  return null;
}

function buildVideoCards(videos) {
  const keys = Object.keys(videos)
    .filter((key) => key.startsWith('video.') && (key.endsWith('.title') || key.endsWith('.url')))
    .sort();

  const groups = {};
  for (const key of keys) {
    const match = key.match(/^video\.(\d+)\.(title|url)$/);
    if (!match) continue;
    const [, index, field] = match;
    groups[index] = groups[index] || {};
    groups[index][field] = videos[key];
  }

  return Object.values(groups)
    .map((item) => {
      const isLocalVideo = item.url && (item.url.endsWith('.mp4') || item.url.endsWith('.webm') || item.url.endsWith('.ogg'));
      return {
        title: item.title,
        url: item.url,
        embed: isLocalVideo ? null : getYoutubeEmbedUrl(item.url),
        isLocalVideo: isLocalVideo
      };
    })
    .filter((item) => item.title && item.url);
}

function applyContent(content) {
  document.title = content['dj.name'] || 'DJ GER';
  document.getElementById('hero-title').textContent = content['dj.name'] || 'DJ GER';
  document.getElementById('hero-subtitle').textContent = content['hero.subtitle'] || '';
  const instagramTopLink = document.getElementById('instagram-link');
  const instagramBottomLink = document.getElementById('instagram-bottom');
  const youtubeTopLink = document.getElementById('youtube-link');
  const youtubeBottomLink = document.getElementById('youtube-bottom');
  const instagramUrl = links['instagram.url'] || instagramTopLink.getAttribute('href') || '#';
  const youtubeUrl = links['youtube.url'] || youtubeTopLink.getAttribute('href') || '#';
  instagramTopLink.textContent = content['hero.button'] || 'Instagram';
  instagramTopLink.href = instagramUrl;
  document.getElementById('bio-title').textContent = content['bio.title'] || 'Biography';
  document.getElementById('bio-text').textContent = content['bio.text'] || '';
  document.getElementById('photos-title').textContent = content['photos.title'] || 'Photos';
  document.getElementById('videos-title').textContent = content['videos.title'] || 'Videos';
  document.getElementById('contact-title').textContent = content['contact.title'] || 'Contact';
  document.getElementById('contact-description').textContent = content['contact.description'] || '';
  const contactEmail = links['contact.email'] || 'Djgerasuppo@gmail.com';
  const contactEmailLink = document.getElementById('contact-email-link');
  if (contactEmailLink) {
    contactEmailLink.textContent = contactEmail;
    contactEmailLink.href = `mailto:${contactEmail}`;
  }
  instagramBottomLink.href = instagramUrl;
  instagramBottomLink.textContent = content['instagram.username'] || 'Instagram';
  youtubeTopLink.href = youtubeUrl;
  youtubeBottomLink.href = youtubeUrl;
  youtubeBottomLink.textContent = content['youtube.username'] || 'YouTube';
  document.getElementById('footer-text').textContent = content['footer.text'] || '© 2026 DJ GER.';
}

function setActiveLanguageButton() {
  document.querySelectorAll('.lang-button').forEach((button) => {
    button.classList.toggle('active', button.dataset.lang === currentLanguage);
  });
}

async function renderPage() {
  await Promise.all([loadContents(), loadLinks()]);
  setActiveLanguageButton();
  const content = contents[currentLanguage] || contents[defaultLanguage] || {};
  applyContent(content);

  const videos = await fetchProperties('static/videos.properties');
  const videoCards = buildVideoCards(videos);
  const list = document.getElementById('video-list');

  if (videoCards.length === 0) {
    list.innerHTML = `<p>${content['videos.empty'] || 'No videos available at the moment.'}</p>`;
    setupPhotoLightbox();
    return;
  }

  list.innerHTML = videoCards
    .map((video) => {
      const iframe = video.embed
        ? `<iframe src="${escapeHtml(video.embed)}" title="${escapeHtml(video.title)}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`
        : `<p><a href="${escapeHtml(video.url)}" target="_blank" rel="noopener">Abrir en YouTube</a></p>`;

      return `
      <article class="video-card">
        <h3>${escapeHtml(video.title)}</h3>
        ${iframe}
      </article>`;
    })
    .join('');

  setupPhotoLightbox();
}

function changeLanguage(event) {
  const button = event.target.closest('.lang-button');
  if (!button) return;
  const newLang = button.dataset.lang;
  if (!supportedLanguages.includes(newLang)) return;
  currentLanguage = newLang;
  localStorage.setItem('djger-language', currentLanguage);
  setActiveLanguageButton();
  applyContent(contents[currentLanguage] || contents[defaultLanguage] || {});
}

function escapeHtml(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

renderPage().catch((error) => {
  console.error('Error cargando contenido:', error);
});

function setupPhotoLightbox() {
  const lightbox = document.getElementById('photo-lightbox');
  const lightboxImage = lightbox.querySelector('.lightbox-image');
  const lightboxCaption = lightbox.querySelector('.lightbox-caption');
  const lightboxClose = lightbox.querySelector('.lightbox-close');

  function openLightbox(image) {
    lightbox.classList.add('active');
    lightbox.setAttribute('aria-hidden', 'false');
    lightboxImage.src = image.src;
    lightboxImage.alt = image.alt || 'Foto ampliada';
    lightboxCaption.textContent = image.alt || '';
    document.body.style.overflow = 'hidden';
    lightbox.focus();
  }

  function closeLightbox() {
    lightbox.classList.remove('active');
    lightbox.setAttribute('aria-hidden', 'true');
    lightboxImage.src = '';
    document.body.style.overflow = '';
  }

  document.querySelectorAll('.photo-grid .photo').forEach((image) => {
    image.addEventListener('click', () => openLightbox(image));
  });

  lightbox.addEventListener('click', (event) => {
    if (event.target === lightbox || event.target === lightboxClose) {
      closeLightbox();
    }
  });

  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && lightbox.classList.contains('active')) {
      closeLightbox();
    }
  });
}

window.addEventListener('click', changeLanguage);

