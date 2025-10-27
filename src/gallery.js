import PhotoSwipeLightbox from 'photoswipe/lightbox';
import 'photoswipe/style.css';

import PhotoSwipeDynamicCaption from 'photoswipe-dynamic-caption-plugin';
import 'photoswipe-dynamic-caption-plugin/photoswipe-dynamic-caption-plugin.css';

// Initialize PhotoSwipe for all galleries
document.querySelectorAll('.image-grid').forEach((gallery, index) => {
  const galleryId = gallery.getAttribute('data-gallery');
  const lightbox = new PhotoSwipeLightbox({
    gallery: `[data-gallery="${galleryId}"]`,
    children: 'a',
    pswpModule: () => import('photoswipe')
  });

  const captionPlugin = new PhotoSwipeDynamicCaption(lightbox, {
    // Plugins options, for example:
    type: 'auto',
    captionContent: `.pswp-caption-content-${index}`,
  });

  lightbox.init();
});
