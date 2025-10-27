import PhotoSwipeLightbox from 'photoswipe/lightbox';
import 'photoswipe/style.css';

const lightbox = new PhotoSwipeLightbox({
  gallery: '.image-grid',
  children: 'a',
  pswpModule: () => import('photoswipe')
});
lightbox.init();
