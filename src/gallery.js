import PhotoSwipeLightbox from 'photoswipe/lightbox';
import 'photoswipe/style.css';

// Initialize PhotoSwipe for all galleries
document.querySelectorAll('.image-grid').forEach((gallery) => {
  const galleryId = gallery.getAttribute('data-gallery');
  const lightbox = new PhotoSwipeLightbox({
    gallery: `[data-gallery="${galleryId}"]`,
    children: 'a',
    pswpModule: () => import('photoswipe')
  });
  lightbox.init();
});
