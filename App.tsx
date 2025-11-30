/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useState, useRef, useEffect, lazy, Suspense } from 'react';
import ReactCrop, { type Crop, PixelCrop, centerCrop, makeAspectCrop } from 'react-image-crop';
import Header from './components/Header';
import { AppSkeleton, ContentSkeleton, ProfilePageSkeleton, ThumbnailSkeleton, ImagePreviewSkeleton } from './components/Skeletons';
import { generateThumbnail, applyFilter, changeBackground, upscaleImage, applyCustomBackground, recreateThumbnail, generateProThumbnail } from './services/geminiService';
import { onAuthStateChangedListener, signOutUser, getUserProfile, incrementUserThumbnailCount, checkAndResetGenerationLimit, decrementUserGenerations } from './services/firebase';
import { getCache, setCache } from './services/cacheService';
import type { User } from 'firebase/auth';
import type { UserProfile } from './types';
import { DownloadIcon, CrossIcon, MagicWandIcon, TextIcon, FilterIcon, UndoIcon, RedoIcon, ImageIcon, UserIcon } from './components/icons';

// Lazy-load page components for code-splitting and faster initial load
const HomePage = lazy(() => import('./components/HomePage'));
const ContactPage = lazy(() => import('./components/ContactPage'));
const FAQPage = lazy(() => import('./components/FAQPage'));
const FeaturesPage = lazy(() => import('./components/FeaturesPage'));
const AboutPage = lazy(() => import('./components/AboutPage'));
const BlogPage = lazy(() => import('./components/BlogPage'));
const PricingPage = lazy(() => import('./components/PricingPage'));
const StartScreen = lazy(() => import('./components/StartScreen'));
const AdjustmentPanel = lazy(() => import('./components/AdjustmentPanel'));
const CropPanel = lazy(() => import('./components/CropPanel'));
const Spinner = lazy(() => import('./components/Spinner'));
const LoginPage = lazy(() => import('./components/LoginPage'));
const SignupPage = lazy(() => import('./components/SignupPage'));
const ProfilePage = lazy(() => import('./components/ProfilePage'));
const CompleteProfilePage = lazy(() => import('./components/CompleteProfilePage'));
const FilterPanel = lazy(() => import('./components/FilterPanel'));
const TextEditorPanel = lazy(() => import('./components/TextEditorPanel'));
const EditableText = lazy(() => import('./components/EditableText'));
const BackgroundPanel = lazy(() => import('./components/BackgroundPanel'));
const AuthenticationPanel = lazy(() => import('./components/AuthenticationPanel'));
const EditableButton = lazy(() => import('./components/EditableButton'));
const RecreatePanel = lazy(() => import('./components/RecreatePanel'));
const ProFeaturePanel = lazy(() => import('./components/ProFeaturePanel'));
const Toast = lazy(() => import('./components/Toast'));
const UpgradeModal = lazy(() => import('./components/UpgradeModal'));
const ConfirmationModal = lazy(() => import('./components/ConfirmationModal'));
const TermsAndConditionsPage = lazy(() => import('./components/TermsAndConditionsPage'));
const PrivacyPolicyPage = lazy(() => import('./components/PrivacyPolicyPage'));
const RefundPolicyPage = lazy(() => import('./components/RefundPolicyPage'));
const CategoryNav = lazy(() => import('./components/CategoryNav'));
const Footer = lazy(() => import('./components/Footer'));


type View = 'home' | 'tool' | 'contact' | 'faq' | 'features' | 'about' | 'blog' | 'login' | 'signup' | 'profile' | 'complete-profile' | 'pricing' | 'terms-and-conditions' | 'privacy-policy' | 'refund-policy';
type Stage = 'upload' | 'crop' | 'options' | 'edit' | 'recreate' | 'pro';
type CroppingTarget = 'initial' | 'secondary' | 'background' | 'recreateCharacter';
type EditorTab = 'filter' | 'text' | 'background' | 'auth';

export interface TextProperties {
  content: string;
  fontSize: number;
  color: string;
  outlineColor: string;
  outlineWidth: number;
  position: { x: number; y: number };
  bold: boolean;
  italic: boolean;
  fontFamily: string;
}

export interface AuthButtonProperties {
  visible: boolean;
  content: string;
  fontSize: number;
  color: string;
  backgroundColor: string;
  position: { x: number; y: number };
  bold: boolean;
  hoverBackgroundColor: string;
  hoverEffect: 'none' | 'lighten' | 'darken' | 'scale';
  fontFamily: string;
}

export interface AuthButtonsState {
    login: AuthButtonProperties;
    signup: AuthButtonProperties;
}

interface EditHistory {
  generatedImage: string;
  textProps: TextProperties;
}

/**
 * Compresses an image data URL to a WebP format for performance.
 * @param dataUrl The input data URL (e.g., from a canvas).
 * @param quality The quality level for WebP compression (0 to 1).
 * @returns A promise that resolves to the compressed WebP data URL.
 */
const compressImage = (dataUrl: string, quality = 0.8): Promise<string> => {
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => {
            const canvas = document.createElement('canvas');
            const MAX_WIDTH = 1280; // Cap width for performance
            const scale = image.width > MAX_WIDTH ? MAX_WIDTH / image.width : 1;
            canvas.width = image.width * scale;
            canvas.height = image.height * scale;
            const ctx = canvas.getContext('2d');
            if (!ctx) return reject(new Error('Could not get canvas context for compression.'));
            ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
            const compressedDataUrl = canvas.toDataURL('image/webp', quality);
            resolve(compressedDataUrl);
        };
        image.onerror = (err) => reject(err);
        image.src = dataUrl;
    });
};

function App() {
  const [currentView, setCurrentView] = useState<View>('home');
  const [stage, setStage] = useState<Stage>('upload');
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [toast, setToast] = useState<{ message: string, type: 'info' | 'error' | 'success' } | null>(null);
  const [isUpgradeModalOpen, setIsUpgradeModalOpen] = useState(false);
  const [confirmation, setConfirmation] = useState<{ 
    isOpen: boolean; 
    message: string; 
    onConfirm: () => void; 
    secondaryAction?: { label: string; onClick: () => void; };
  } | null>(null);

  const [imgSrc, setImgSrc] = useState('');
  const [imgSrc2, setImgSrc2] = useState('');
  const [bgImgSrcToCrop, setBgImgSrcToCrop] = useState('');
  const [crop, setCrop] = useState<Crop>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop>();
  const [croppedImage, setCroppedImage] = useState<string | null>(null);
  const [croppedImage2, setCroppedImage2] = useState<string | null>(null);
  const [generatedVariations, setGeneratedVariations] = useState<(string | null)[]>([]);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [croppingTarget, setCroppingTarget] = useState<CroppingTarget>('initial');
  const [activeEditorTab, setActiveEditorTab] = useState<EditorTab>('filter');
  const [shouldUpscale, setShouldUpscale] = useState(false);
  const [numberOfVariations, setNumberOfVariations] = useState<1 | 2>(2); // Default 2 variations

  const imgRef = useRef<HTMLImageElement>(null);
  const imagePreviewRef = useRef<HTMLDivElement>(null);

  const [category, setCategory] = useState('Vlog');
  const [emotion, setEmotion] = useState('Happy');
  const [emotionIntensity, setEmotionIntensity] = useState(70);
  const [difficulty, setDifficulty] = useState('Medium');
  const [title, setTitle] = useState('');
  const [textColor, setTextColor] = useState('AI Choice');
  const [fontStyle, setFontStyle] = useState('AI Choice');
  const [backgroundStyle, setBackgroundStyle] = useState('AI Choice');
  const [outlineThickness, setOutlineThickness] = useState('AI Choice');
  const [outlineColor, setOutlineColor] = useState('AI Choice');
  const [customBackgroundPrompt, setCustomBackgroundPrompt] = useState('');
  const [customBgImageSrc, setCustomBgImageSrc] = useState<string | null>(null);

  const [originalThumbnail, setOriginalThumbnail] = useState<string | null>(null);
  const [recreateCharacterImage, setRecreateCharacterImage] = useState<string | null>(null);
  const [recreateCharacterImgSrcToCrop, setRecreateCharacterImgSrcToCrop] = useState('');
  const [recreateText, setRecreateText] = useState('');
  
  const [proPrompt, setProPrompt] = useState('');
  const [proGeneratedImage, setProGeneratedImage] = useState<string | null>(null);

  const [textProps, setTextProps] = useState<TextProperties>({
    content: '',
    fontSize: 100,
    color: '#FFFFFF',
    outlineColor: '#000000',
    outlineWidth: 8,
    position: { x: 50, y: 80 },
    bold: false,
    italic: false,
    fontFamily: 'Anton',
  });

  const [authButtonsProps, setAuthButtonsProps] = useState<AuthButtonsState>({
    login: {
      visible: false,
      content: 'Login',
      fontSize: 24,
      color: '#111827',
      backgroundColor: '#FFFFFF',
      position: { x: 8, y: 8 },
      bold: true,
      hoverBackgroundColor: '#FBBF24',
      hoverEffect: 'scale',
      fontFamily: 'Inter',
    },
    signup: {
        visible: false,
        content: 'Sign Up',
        fontSize: 24,
        color: '#111827',
        backgroundColor: '#FBBF24',
        position: { x: 22, y: 8 },
        bold: true,
        hoverBackgroundColor: '#FFFFFF',
        hoverEffect: 'scale',
        fontFamily: 'Inter',
    }
  });

  const [history, setHistory] = useState<EditHistory[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const debounceTimeout = useRef<number | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChangedListener(async (user) => {
      if (user) {
        if (userProfile && userProfile.uid === user.uid) {
            setIsAuthLoading(false);
            return;
        }
        try {
          let profile = await getUserProfile(user.uid);
          if (profile) {
              profile = await checkAndResetGenerationLimit(profile);
          }
          setCurrentUser(user);
          setUserProfile(profile);
        } catch (error) {
          console.error("Failed to fetch user profile during auth state change:", error);
          await signOutUser();
        } finally {
          setIsAuthLoading(false);
        }
      } else {
        setCurrentUser(null);
        setUserProfile(null);
        setIsAuthLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (isAuthLoading) {
      return;
    }

    const isAuthView = currentView === 'login' || currentView === 'signup';
    const isProfileCompletionView = currentView === 'complete-profile';

    if (currentUser && userProfile) {
      if (isAuthView || isProfileCompletionView) {
        setCurrentView('profile');
      }
    } 
    else if (currentUser && !userProfile) {
      if (!isProfileCompletionView) {
        setCurrentView('complete-profile');
      }
    }
    else if (!currentUser) {
      const protectedViews: View[] = ['profile', 'tool', 'complete-profile'];
      if (protectedViews.includes(currentView)) {
        setCurrentView('login');
      }
    }
  }, [currentUser, userProfile, isAuthLoading, currentView]);

  const shouldAddWatermark = !currentUser || (userProfile?.plan === 'Free');

  useEffect(() => {
    if (stage !== 'edit' || historyIndex < 0) return;

    if (debounceTimeout.current) clearTimeout(debounceTimeout.current);

    debounceTimeout.current = window.setTimeout(() => {
      const lastHistoryState = history[historyIndex];
      if (lastHistoryState && generatedImage && JSON.stringify(textProps) !== JSON.stringify(lastHistoryState.textProps)) {
        pushToHistory({ generatedImage, textProps });
      }
    }, 500);

    return () => {
      if (debounceTimeout.current) clearTimeout(debounceTimeout.current);
    };
  }, [textProps, stage, historyIndex]);

  const handleFileSelect = (files: FileList | null) => {
    if (files && files.length > 0) {
      const file = files[0];
      if (file.type.startsWith('image/')) {
        setCroppedImage(null);
        setGeneratedVariations([]);
        setError(null);
        setCrop(undefined);
        setImgSrc(URL.createObjectURL(file));
        setCroppingTarget('initial');
        setStage('crop');
      } else {
        setError('Please upload a valid image file.');
      }
    }
  };
  
  const handleSecondFileSelect = (files: FileList | null) => {
    if (files && files.length > 0) {
      const file = files[0];
      if (file.type.startsWith('image/')) {
        setError(null);
        setCrop(undefined);
        setImgSrc2(URL.createObjectURL(file));
        setCroppingTarget('secondary');
        setStage('crop');
      } else {
        setError('Please upload a valid image file.');
      }
    }
  };

  const handleOriginalThumbnailSelect = (files: FileList | null) => {
    if (files && files.length > 0) {
      const file = files[0];
      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = () => setOriginalThumbnail(reader.result as string);
        reader.readAsDataURL(file);
      } else {
        setError('Please upload a valid image file for the thumbnail.');
      }
    }
  };

  const handleRecreateCharacterSelect = (files: FileList | null) => {
    if (files && files.length > 0) {
      const file = files[0];
      if (file.type.startsWith('image/')) {
        setError(null);
        setCrop(undefined);
        setRecreateCharacterImgSrcToCrop(URL.createObjectURL(file));
        setCroppingTarget('recreateCharacter');
        setStage('crop');
      } else {
        setError('Please upload a valid image file for the character.');
      }
    }
  };

  function onImageLoad(e: React.SyntheticEvent<HTMLImageElement>) {
    const { width, height } = e.currentTarget;
    const initialCrop = centerCrop(
      makeAspectCrop({ unit: '%', width: 90, }, 16 / 9, width, height),
      width,
      height
    );
    setCrop(initialCrop);
  }

  const handleApplyCrop = async () => {
    const image = imgRef.current;
    if (!image || !completedCrop) {
      throw new Error('Crop details are not available');
    }

    const canvas = document.createElement('canvas');
    const scaleX = image.naturalWidth / image.width;
    const scaleY = image.naturalHeight / image.height;
    
    canvas.width = completedCrop.width;
    canvas.height = completedCrop.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not get canvas context');

    const cropX = completedCrop.x * scaleX;
    const cropY = completedCrop.y * scaleY;
    const cropWidth = completedCrop.width * scaleX;
    const cropHeight = completedCrop.height * scaleY;

    ctx.drawImage(image, cropX, cropY, cropWidth, cropHeight, 0, 0, completedCrop.width, completedCrop.height);

    const base64Image = canvas.toDataURL('image/png');
    
    try {
        const compressedImage = await compressImage(base64Image);
        if (croppingTarget === 'initial') {
            setCroppedImage(compressedImage);
            setStage('options');
        } else if (croppingTarget === 'secondary') {
            setCroppedImage2(compressedImage);
            setStage('options');
        } else if (croppingTarget === 'background') {
            setCustomBgImageSrc(compressedImage);
            setStage('edit');
        } else if (croppingTarget === 'recreateCharacter') {
            setRecreateCharacterImage(compressedImage);
            setStage('recreate');
        }
    } catch (compressionError) {
        console.error("Image compression failed:", compressionError);
        setError("Could not process the image. Please try a different one.");
        // Fallback to original if compression fails for some reason
        if (croppingTarget === 'initial') {
            setCroppedImage(base64Image);
            setStage('options');
        }
    }
  };

  const handleLimitReached = () => {
    if (!userProfile?.hasPaid) {
      setToast({
          message: 'Please purchase a subscription plan to start generating thumbnails.',
          type: 'info',
      });
      setCurrentView('pricing');
    } else {
      setToast({
          message: 'You have reached your generation limit for the month. Please upgrade to continue generating thumbnails.',
          type: 'info',
      });
      setIsUpgradeModalOpen(true);
    }
  };

  const handleUpgradeClick = () => {
    setConfirmation(null); // Close confirmation modal first
    setIsUpgradeModalOpen(true);
  };

  const getConfirmationProps = (onConfirm: () => void) => {
    const generationsToUse = numberOfVariations;
    const variationText = generationsToUse === 1 ? '1 variation' : '2 variations';
    let message = `Are you sure you want to generate ${variationText}? This will use ${generationsToUse} of your remaining generations.`;
    let secondaryAction: { label: string; onClick: () => void; } | undefined = undefined;

    if (userProfile && userProfile.remainingGenerations < generationsToUse) {
        message = `You need ${generationsToUse} generations but only have ${userProfile.remainingGenerations} remaining. Please upgrade your plan.`;
        secondaryAction = {
            label: 'Upgrade Plan',
            onClick: handleUpgradeClick
        };
    } else if (userProfile && userProfile.remainingGenerations === generationsToUse) {
        message = `This will use all your remaining generations (${generationsToUse}). Are you sure you want to proceed?`;
        secondaryAction = {
            label: 'Upgrade Plan',
            onClick: handleUpgradeClick
        };
    }

    return {
        isOpen: true,
        message,
        onConfirm,
        secondaryAction
    };
  };

  const executeGenerate = async () => {
    const options = { category, title, emotion, emotionIntensity, textColor, fontStyle, backgroundStyle, outlineThickness, outlineColor, addWatermark: shouldAddWatermark, customBackgroundPrompt, difficulty, numberOfVariations };
    const cacheKey = JSON.stringify({ type: 'generate', options });

    const cachedResult = await getCache(cacheKey);
    if (cachedResult) {
        console.log("Found cached result in IndexedDB, skipping generation.");
        // If cached result has 2 but user wants 1, take only first
        if (numberOfVariations === 1 && Array.isArray(cachedResult) && cachedResult.length >= 1) {
            setGeneratedVariations([cachedResult[0], null]);
        } else {
            setGeneratedVariations(cachedResult);
        }
        return;
    }

    setIsLoading(true);
    setError(null);
    setGeneratedVariations(numberOfVariations === 1 ? [null, null] : [null, null]);

    const generationPromises = generateThumbnail(
      croppedImage!, category, title, emotion, emotionIntensity, textColor, fontStyle, backgroundStyle,
      outlineThickness, outlineColor, shouldAddWatermark,
      needsSecondImage ? croppedImage2 : null,
      customBackgroundPrompt, difficulty
    );
    
    // Only process the number of variations user wants
    const promisesToProcess = numberOfVariations === 1 ? [generationPromises[0]] : generationPromises;
    
    // Process each promise as it resolves
    promisesToProcess.forEach((promise, index) => {
        promise.then(dataUrl => {
            setGeneratedVariations(prev => {
                const newVariations = [...prev];
                newVariations[index] = dataUrl;
                return newVariations;
            });
        }).catch(err => {
            console.error(`Variation ${index + 1} failed:`, err);
            // Error is handled globally by Promise.all catch block
        });
    });

    try {
      const resultDataUrls = await Promise.all(promisesToProcess);
      
      // If user wants 1 variation, only save the first one
      const finalResults = numberOfVariations === 1 ? [resultDataUrls[0], null] : resultDataUrls;

      const { cleanupOccurred } = await setCache(cacheKey, finalResults);
      if (cleanupOccurred) {
        setToast({ message: "Storage full. Old data has been cleared to free up space.", type: 'info' });
      }

      if (currentUser) {
        // Deduct generations based on number of variations
        const generationsToDeduct = numberOfVariations;
        
        // Update thumbnail count (count each variation as 1 thumbnail)
        for (let i = 0; i < generationsToDeduct; i++) {
          await incrementUserThumbnailCount(currentUser.uid);
        }
        
        // Deduct generations
        for (let i = 0; i < generationsToDeduct; i++) {
          await decrementUserGenerations(currentUser.uid);
        }
        
        setUserProfile(prev => prev ? { 
          ...prev, 
          thumbnailCount: (prev.thumbnailCount || 0) + generationsToDeduct, 
          remainingGenerations: prev.remainingGenerations - generationsToDeduct 
        } : null);
      }

    } catch (err: any) {
      console.error('Generation failed:', err);
      setError(err.message || 'An unexpected error occurred during thumbnail generation.');
    } finally {
      setIsLoading(false);
    }
  };

  const needsSecondImage = category === "Before & After" || category === "Product Review" || category === "Food";
  const handleGenerate = () => {
    // Check if user has paid first
    if (currentUser && userProfile && !userProfile.hasPaid) {
        setToast({
            message: 'Please purchase a subscription plan to generate thumbnails.',
            type: 'info',
        });
        setCurrentView('pricing');
        return;
    }
    // Check if user has enough remaining generations for the selected number of variations
    const generationsNeeded = numberOfVariations;
    if (currentUser && userProfile && userProfile.remainingGenerations < generationsNeeded) {
        handleLimitReached();
        return;
    }
    if (!croppedImage || !category || !emotion || !title.trim()) {
      setError('Please ensure all fields are filled and an image is cropped.');
      return;
    }
    if (needsSecondImage && !croppedImage2) {
      setError(`The "${category}" category requires a second image to be uploaded.`);
      return;
    }
    
    setConfirmation(getConfirmationProps(executeGenerate));
  };

  const executeGeneratePro = async () => {
    setIsLoading(true);
    setError(null);
    setProGeneratedImage(null);

    try {
        const cacheKey = JSON.stringify({ type: 'pro', prompt: proPrompt, watermark: shouldAddWatermark });
        const cachedResult = await getCache(cacheKey);
        if (cachedResult) {
            console.log("Found cached pro result, skipping generation.");
            setProGeneratedImage(cachedResult);
            setIsLoading(false);
            return;
        }

        const resultDataUrl = await generateProThumbnail(proPrompt, shouldAddWatermark);

        const { cleanupOccurred } = await setCache(cacheKey, resultDataUrl);
        if (cleanupOccurred) {
            setToast({ message: "Storage full. Old data has been cleared to free up space.", type: 'info' });
        }

        setProGeneratedImage(resultDataUrl);
        
        if (currentUser) {
            await incrementUserThumbnailCount(currentUser.uid);
            await decrementUserGenerations(currentUser.uid);
            setUserProfile(prev => prev ? { ...prev, thumbnailCount: (prev.thumbnailCount || 0) + 1, remainingGenerations: prev.remainingGenerations - 1 } : null);
        }

    } catch (err: any) {
        console.error('Pro Generation failed:', err);
        setError(err.message || 'An unexpected error occurred during pro thumbnail generation.');
    } finally {
        setIsLoading(false);
    }
  };
  
  const handleGeneratePro = () => {
    // Check if user has paid first
    if (currentUser && userProfile && !userProfile.hasPaid) {
        setToast({
            message: 'Please purchase a subscription plan to generate thumbnails.',
            type: 'info',
        });
        setCurrentView('pricing');
        return;
    }
    // Check if user has remaining generations
    if (currentUser && userProfile && userProfile.remainingGenerations <= 0) {
        handleLimitReached();
        return;
    }
    if (!proPrompt.trim()) {
        setError('Please enter a prompt to generate a thumbnail.');
        return;
    }
    setConfirmation(getConfirmationProps(executeGeneratePro));
  };

  const executeRecreateGenerate = async () => {
    setIsLoading(true);
    setError(null);
    setTitle(recreateText || 'Recreated Thumbnail');

    const cacheKey = JSON.stringify({ type: 'recreate', text: recreateText, watermark: shouldAddWatermark });
    const cachedResult = await getCache(cacheKey);
    if (cachedResult) {
        console.log("Found cached result for re-creation, skipping generation.");
        setGeneratedVariations(cachedResult);
        setStage('options');
        setIsLoading(false);
        return;
    }

    setGeneratedVariations([null, null]);

    const generationPromises = recreateThumbnail(
      originalThumbnail!,
      recreateCharacterImage!,
      recreateText,
      shouldAddWatermark
    );
    
    generationPromises.forEach((promise, index) => {
        promise.then(dataUrl => {
            setGeneratedVariations(prev => {
                const newVariations = [...prev];
                newVariations[index] = dataUrl;
                return newVariations;
            });
        }).catch(err => {
            console.error(`Re-creation Variation ${index + 1} failed:`, err);
        });
    });


    try {
      const resultDataUrls = await Promise.all(generationPromises);

      const { cleanupOccurred } = await setCache(cacheKey, resultDataUrls);
      if (cleanupOccurred) {
        setToast({ message: "Storage full. Old data has been cleared to free up space.", type: 'info' });
      }

      if (currentUser) {
        await incrementUserThumbnailCount(currentUser.uid);
        await decrementUserGenerations(currentUser.uid);
        setUserProfile(prev => prev ? { ...prev, thumbnailCount: (prev.thumbnailCount || 0) + 1, remainingGenerations: prev.remainingGenerations - 1 } : null);
      }

      setStage('options');
    } catch (err: any) {
      console.error('Re-creation failed:', err);
      setError(err.message || 'An unexpected error occurred during thumbnail re-creation.');
      setStage('recreate');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRecreateGenerate = () => {
    // Check if user has paid first
    if (currentUser && userProfile && !userProfile.hasPaid) {
        setToast({
            message: 'Please purchase a subscription plan to generate thumbnails.',
            type: 'info',
        });
        setCurrentView('pricing');
        return;
    }
    // Check if user has remaining generations
    if (currentUser && userProfile && userProfile.remainingGenerations <= 0) {
        handleLimitReached();
        return;
    }
    if (!originalThumbnail) {
        setError('Please upload the original thumbnail you want to re-create.');
        return;
    }
    if (!recreateCharacterImage) {
        setError('Please upload an image of the new person to replace the one in the thumbnail.');
        return;
    }
    setConfirmation(getConfirmationProps(executeRecreateGenerate));
  };

  const pushToHistory = (newState: EditHistory) => {
    const newHistory = [...history.slice(0, historyIndex + 1), newState];
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
  };

  const handleApplyFilter = async (prompt: string) => {
    if (!generatedImage) {
      setError('There is no generated image to apply a filter to.');
      return;
    }

    setIsLoading(true);
    setError(null);

    const cacheKey = JSON.stringify({ type: 'filter', prompt, watermark: shouldAddWatermark });
    const cachedResult = await getCache(cacheKey);
    if (cachedResult) {
        console.log("Found cached filter result, skipping generation.");
        setGeneratedImage(cachedResult);
        pushToHistory({ generatedImage: cachedResult, textProps });
        setIsLoading(false);
        return;
    }

    try {
      const resultDataUrl = await applyFilter(generatedImage, prompt, shouldAddWatermark);
      
      const { cleanupOccurred } = await setCache(cacheKey, resultDataUrl);
      if (cleanupOccurred) {
        setToast({ message: "Storage full. Old data has been cleared to free up space.", type: 'info' });
      }

      setGeneratedImage(resultDataUrl);
      pushToHistory({ generatedImage: resultDataUrl, textProps });
    } catch (err: any) {
      console.error('Filter failed:', err);
      setError(err.message || 'An unexpected error occurred while applying the filter.');
    } finally {
      setIsLoading(false);
    }
  };
  
  const handleChangeBackground = async (prompt: string) => {
    if (!generatedImage) {
      setError('There is no generated image to change the background of.');
      return;
    }

    setIsLoading(true);
    setError(null);
    
    const cacheKey = JSON.stringify({ type: 'changeBg', prompt, watermark: shouldAddWatermark });
    const cachedResult = await getCache(cacheKey);
    if (cachedResult) {
        console.log("Found cached background change result, skipping generation.");
        setGeneratedImage(cachedResult);
        pushToHistory({ generatedImage: cachedResult, textProps });
        setIsLoading(false);
        return;
    }

    try {
      const resultDataUrl = await changeBackground(generatedImage, prompt, shouldAddWatermark);

      const { cleanupOccurred } = await setCache(cacheKey, resultDataUrl);
      if (cleanupOccurred) {
        setToast({ message: "Storage full. Old data has been cleared to free up space.", type: 'info' });
      }
      
      setGeneratedImage(resultDataUrl);
      pushToHistory({ generatedImage: resultDataUrl, textProps });
    } catch (err: any) {
      console.error('Background change failed:', err);
      setError(err.message || 'An unexpected error occurred while changing the background.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCustomBackgroundSelectForCrop = (files: FileList | null) => {
    if (files && files.length > 0) {
      const file = files[0];
      if (file.type.startsWith('image/')) {
        setError(null);
        setCrop(undefined);
        setBgImgSrcToCrop(URL.createObjectURL(file));
        setCroppingTarget('background');
        setStage('crop');
      } else {
        setError('Please upload a valid image file for the background.');
      }
    }
  };

  const handleApplyCustomBackground = async (bgImageUrl: string) => {
    if (!generatedImage || !bgImageUrl) {
        setError('There is no generated image or background image to apply.');
        return;
    }

    setIsLoading(true);
    setError(null);

    const cacheKey = JSON.stringify({ type: 'customBg', watermark: shouldAddWatermark });
    const cachedResult = await getCache(cacheKey);
    if (cachedResult) {
        console.log("Found cached custom background result, skipping generation.");
        setGeneratedImage(cachedResult);
        pushToHistory({ generatedImage: cachedResult, textProps });
        setIsLoading(false);
        return;
    }

    try {
        const resultDataUrl = await applyCustomBackground(generatedImage, bgImageUrl, shouldAddWatermark);
        
        const { cleanupOccurred } = await setCache(cacheKey, resultDataUrl);
        if (cleanupOccurred) {
          setToast({ message: "Storage full. Old data has been cleared to free up space.", type: 'info' });
        }

        setGeneratedImage(resultDataUrl);
        pushToHistory({ generatedImage: resultDataUrl, textProps });
    } catch (err: any) {
      console.error('Custom background change failed:', err);
      setError(err.message || 'An unexpected error occurred while applying the custom background.');
    } finally {
      setIsLoading(false);
    }
  };

  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < history.length - 1;

  const handleUndo = () => {
    if (!canUndo) return;
    const newIndex = historyIndex - 1;
    setHistoryIndex(newIndex);
    const prevState = history[newIndex];
    setGeneratedImage(prevState.generatedImage);
    setTextProps(prevState.textProps);
  };

  const handleRedo = () => {
    if (!canRedo) return;
    const newIndex = historyIndex + 1;
    setHistoryIndex(newIndex);
    const nextState = history[newIndex];
    setGeneratedImage(nextState.generatedImage);
    setTextProps(nextState.textProps);
  };

  const handleDownload = (imageUrl: string, downloadTitle: string) => {
    if (!imageUrl) return;
    const link = document.createElement('a');
    link.href = imageUrl;
    link.download = `${downloadTitle.replace(/\s+/g, '_')}-thumb.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleInitialDownload = async (imageUrl: string) => {
    if (!imageUrl) return;

    if (shouldUpscale) {
      setIsLoading(true);
      setError(null);
      try {
        const upscaledImage = await upscaleImage(imageUrl, shouldAddWatermark);
        handleDownload(upscaledImage, `${title}-4k`);
      } catch (err: any) {
        console.error('Upscaling failed:', err);
        setError(err.message || 'An unexpected error occurred during image upscaling.');
      } finally {
        setIsLoading(false);
      }
    } else {
      handleDownload(imageUrl, title);
    }
  };

  const handleDownloadEditedImage = async () => {
    if (!generatedImage) return;
    
    setIsLoading(true);
    setError(null);

    const getCompositedImage = (): Promise<string> => {
      return new Promise((resolve, reject) => {
        const canvas = document.createElement('canvas');
        canvas.width = 1280;
        canvas.height = 720;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          return reject(new Error("Could not create canvas context for download."));
        }

        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.src = generatedImage;

        const drawButtonOnCanvas = (context: CanvasRenderingContext2D, props: AuthButtonProperties) => {
            if (!props.visible) return;

            const { content, fontSize, color, backgroundColor, position, bold, fontFamily } = props;
            
            const btnFontStyle = `${bold ? 'bold ' : 'normal '}`;
            context.font = `${btnFontStyle} ${fontSize}px "${fontFamily}", sans-serif`;
            context.textAlign = 'center';
            context.textBaseline = 'middle';

            const textMetrics = context.measureText(content);
            const paddingX = fontSize * 0.8;
            const paddingY = fontSize * 0.4;
            const btnWidth = textMetrics.width + (paddingX * 2);
            const btnHeight = fontSize + (paddingY * 2);
            const borderRadius = fontSize * 0.3;

            const x = (position.x / 100) * 1280;
            const y = (position.y / 100) * 720;
            const btnX = x - (btnWidth / 2);
            const btnY = y - (btnHeight / 2);

            context.fillStyle = backgroundColor;
            context.beginPath();
            context.moveTo(btnX + borderRadius, btnY);
            context.lineTo(btnX + btnWidth - borderRadius, btnY);
            context.quadraticCurveTo(btnX + btnWidth, btnY, btnX + btnWidth, btnY + borderRadius);
            context.lineTo(btnX + btnWidth, btnY + btnHeight - borderRadius);
            context.quadraticCurveTo(btnX + btnWidth, btnY + btnHeight, btnX + btnWidth - borderRadius, btnY + btnHeight);
            context.lineTo(btnX + borderRadius, btnY + btnHeight);
            context.quadraticCurveTo(btnX, btnY + btnHeight, btnX, btnY + btnHeight - borderRadius);
            context.lineTo(btnX, btnY + borderRadius);
            context.quadraticCurveTo(btnX, btnY, btnX + borderRadius, btnY);
            context.closePath();
            context.fill();

            context.fillStyle = color;
            context.fillText(content, x, y);
        };

        img.onload = () => {
          try {
            ctx.drawImage(img, 0, 0, 1280, 720);
            const { content, fontSize, color, outlineColor, outlineWidth, position, bold, italic, fontFamily } = textProps;
            const fontStyle = `${italic ? 'italic ' : ''}${bold ? '900 ' : 'normal '}`;
            ctx.font = `${fontStyle} ${fontSize}px "${fontFamily}", sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            
            const lines = content.split('\n');
            const lineHeight = fontSize * 1.2;
            const totalTextHeight = lines.length * lineHeight;
            const startY = ((position.y / 100) * 720) - (totalTextHeight / 2) + (lineHeight / 2);

            lines.forEach((line, index) => {
                const x = (position.x / 100) * 1280;
                const y = startY + (index * lineHeight);
                if (outlineWidth > 0) {
                    ctx.strokeStyle = outlineColor;
                    ctx.lineWidth = outlineWidth * 2;
                    ctx.lineJoin = 'round';
                    ctx.miterLimit = 2;
                    ctx.strokeText(line, x, y);
                }
                ctx.fillStyle = color;
                ctx.fillText(line, x, y);
            });
            drawButtonOnCanvas(ctx, authButtonsProps.login);
            drawButtonOnCanvas(ctx, authButtonsProps.signup);
            
            if (shouldAddWatermark) {
                ctx.font = 'bold 20px "Inter", sans-serif';
                ctx.fillStyle = 'rgba(255, 255, 255, 0.65)';
                ctx.textAlign = 'right';
                ctx.textBaseline = 'bottom';
                ctx.fillText('MADE BY PRO THUMBNAIL GENERATOR', canvas.width - 20, canvas.height - 20);
            }
            resolve(canvas.toDataURL('image/png'));
          } catch (e: any) {
            reject(new Error(`Failed to render text on canvas: ${e.message}`));
          }
        };

        img.onerror = () => {
          reject(new Error("Failed to load image for final download rendering."));
        };
      });
    };

    try {
      const compositedImage = await getCompositedImage();
      if (shouldUpscale) {
        const upscaledImage = await upscaleImage(compositedImage, shouldAddWatermark);
        handleDownload(upscaledImage, `${title}-4k`);
      } else {
        handleDownload(compositedImage, title);
      }
    } catch (err: any) {
      setError(err.message || "An error occurred during image finalization.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectForEditing = (imageUrl: string) => {
    setGeneratedImage(imageUrl);
    // When entering the editor, reset the editable text content to be blank.
    // This prevents confusion where the user tries to edit the burned-in text
    // from the AI-generated image by manipulating an identical text overlay.
    // The user can now add *new* text if they wish.
    const initialEditState = { generatedImage: imageUrl, textProps: { ...textProps, content: '' } };
    
    setTextProps(initialEditState.textProps);
    pushToHistory(initialEditState);
    setStage('edit');
  };
  
  const handleReset = () => {
    setStage('upload');
    setImgSrc('');
    setImgSrc2('');
    setBgImgSrcToCrop('');
    setCroppedImage(null);
    setCroppedImage2(null);
    setGeneratedVariations([]);
    setGeneratedImage(null);
    setError(null);
    setTitle('');
    setCategory('Vlog');
    setEmotion('Happy');
    setEmotionIntensity(70);
    setDifficulty('Medium');
    setTextColor('AI Choice');
    setFontStyle('AI Choice');
    setBackgroundStyle('AI Choice');
    setOutlineThickness('AI Choice');
    setOutlineColor('AI Choice');
    setCustomBackgroundPrompt('');
    setCustomBgImageSrc(null);
    setHistory([]);
    setHistoryIndex(-1);
    setOriginalThumbnail(null);
    setRecreateCharacterImage(null);
    setRecreateCharacterImgSrcToCrop('');
    setRecreateText('');
    setProPrompt('');
    setProGeneratedImage(null);
  }

  const handleStartRecreate = () => {
    handleReset();
    setStage('recreate');
  };

  const handleStartProFeature = () => {
    handleReset();
    setStage('pro');
  };

  const handleSignOut = async () => {
    await signOutUser();
    setCurrentView('login');
  };

  const handleLoginSuccess = (newProfile: UserProfile) => {
    setUserProfile(newProfile);
    setCurrentView('profile');
  };

  const handleSignupSuccess = (newProfile: UserProfile) => {
    setUserProfile(newProfile);
    setCurrentView('profile');
  };

  const renderToolContent = () => {
    const currentImgSrc =
      croppingTarget === 'initial' ? imgSrc :
      croppingTarget === 'secondary' ? imgSrc2 :
      croppingTarget === 'background' ? bgImgSrcToCrop :
      croppingTarget === 'recreateCharacter' ? recreateCharacterImgSrcToCrop :
      '';

    switch (stage) {
      case 'upload':
        return <StartScreen onFileSelect={handleFileSelect} onRecreateClick={handleStartRecreate} onStartProFeature={handleStartProFeature} />;
      case 'pro':
        return <ProFeaturePanel
                    prompt={proPrompt}
                    setPrompt={setProPrompt}
                    onGenerate={handleGeneratePro}
                    isLoading={isLoading}
                    generatedImage={proGeneratedImage}
                    onDownload={(imageUrl) => handleDownload(imageUrl, proPrompt)}
                    onCancel={handleReset}
                    error={error}
                />;
      case 'recreate':
        return <RecreatePanel
                  originalThumbnail={originalThumbnail}
                  setOriginalThumbnail={setOriginalThumbnail}
                  onOriginalThumbnailSelect={handleOriginalThumbnailSelect}
                  recreateCharacterImage={recreateCharacterImage}
                  setRecreateCharacterImage={setRecreateCharacterImage}
                  onCharacterSelectForCrop={handleRecreateCharacterSelect}
                  recreateText={recreateText}
                  setRecreateText={setRecreateText}
                  onGenerate={handleRecreateGenerate}
                  isLoading={isLoading}
                  onCancel={handleReset}
               />;
      case 'crop':
        const handleCancelCrop = () => {
          if (croppingTarget === 'initial') {
            handleReset();
          } else if (croppingTarget === 'secondary') {
            setImgSrc2('');
            setStage('options');
          } else if (croppingTarget === 'recreateCharacter') {
            setRecreateCharacterImgSrcToCrop('');
            setStage('recreate');
          } else {
            setBgImgSrcToCrop('');
            setStage('edit');
          }
        };

        return (
          <div className="flex flex-col items-center gap-8 animate-fade-in">
            <div className="w-full max-w-5xl bg-black/30 border border-[var(--color-base-300)] rounded-lg flex items-center justify-center p-2 relative overflow-hidden">
              {currentImgSrc && (
                <>
                  <ReactCrop
                    crop={crop}
                    onChange={(_, percentCrop) => setCrop(percentCrop)}
                    onComplete={(c) => setCompletedCrop(c)}
                    aspect={16 / 9}
                    className="max-w-full max-h-full"
                  >
                    <img
                      ref={imgRef}
                      alt="Crop preview"
                      src={currentImgSrc}
                      onLoad={onImageLoad}
                      className="max-w-full max-h-[70vh] object-contain"
                    />
                  </ReactCrop>
                  <button
                    onClick={handleCancelCrop}
                    className="absolute top-3 right-3 z-10 p-2 bg-black/60 rounded-full text-[var(--color-base-content)] hover:bg-black/80 transition-colors"
                    aria-label="Cancel crop"
                  >
                    <CrossIcon className="w-5 h-5" />
                  </button>
                </>
              )}
            </div>
            <CropPanel
              onApplyCrop={handleApplyCrop}
              onCancel={handleCancelCrop}
              isLoading={isLoading}
              isCropping={!!completedCrop && completedCrop.width > 0}
            />
          </div>
        );
      case 'edit':
        if (!generatedImage) {
          handleReset();
          return null;
        }
        const TabButton: React.FC<{tab: EditorTab, label: string, icon: React.ReactNode}> = ({ tab, label, icon }) => (
            <button 
              onClick={() => setActiveEditorTab(tab)}
              className={`flex-1 flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 py-2 sm:py-3 px-2 sm:px-4 font-semibold text-xs sm:text-base transition-colors rounded-t-lg ${
                activeEditorTab === tab 
                  ? 'bg-[var(--color-base-200)] text-[var(--color-accent)]'
                  : 'bg-black/20 text-[var(--color-muted-content)] hover:bg-[var(--color-base-200)]/50'
              }`}
            >
              {icon}
              <span className="mt-1 sm:mt-0">{label}</span>
            </button>
        );
        return (
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-8 items-start animate-fade-in">
            <div className="lg:col-span-3 flex flex-col items-center gap-4">
              <div 
                ref={imagePreviewRef}
                className="w-full aspect-video bg-black/30 border border-[var(--color-base-300)] rounded-lg flex items-center justify-center p-1 relative overflow-hidden"
              >
                 {isLoading ? (
                    <ImagePreviewSkeleton text={shouldUpscale ? "Upscaling to 4K..." : "Applying Edits..."} />
                 ) : error ? (
                    <div className="absolute inset-0 bg-[var(--color-error)]/80 flex flex-col items-center justify-center z-20 p-6 text-center animate-fade-in">
                        <h3 className="text-xl font-bold text-[var(--color-base-content)]">Operation Failed</h3>
                        <p className="mt-2 text-[var(--color-base-content)]/80">{error}</p>
                    </div>
                 ) : (
                    <>
                        <img src={generatedImage} alt="Editable Thumbnail" className="w-full h-full object-contain"/>
                        <EditableText 
                          textProps={textProps}
                          setTextProps={setTextProps}
                          containerRef={imagePreviewRef}
                        />
                        <EditableButton
                            buttonProps={authButtonsProps.login}
                            setButtonProps={(updater) => setAuthButtonsProps(prev => ({ ...prev, login: typeof updater === 'function' ? updater(prev.login) : updater }))}
                            containerRef={imagePreviewRef}
                            onButtonClick={() => setCurrentView('login')}
                        />
                        <EditableButton
                            buttonProps={authButtonsProps.signup}
                            setButtonProps={(updater) => setAuthButtonsProps(prev => ({ ...prev, signup: typeof updater === 'function' ? updater(prev.signup) : updater }))}
                            containerRef={imagePreviewRef}
                            onButtonClick={() => setCurrentView('signup')}
                        />
                    </>
                 )}
              </div>
              <div className={`w-full flex flex-col sm:flex-row items-center justify-center gap-4 flex-wrap transition-opacity ${isLoading ? 'opacity-50 pointer-events-none' : ''}`}>
                 <div className="w-full sm:w-auto flex flex-col items-center">
                    <button 
                      onClick={handleDownloadEditedImage} 
                      className="w-full sm:w-auto flex items-center justify-center gap-3 bg-gradient-to-br from-[var(--color-accent-dark)] to-[var(--color-accent)] text-[var(--color-accent-content)] font-bold py-3 px-6 rounded-lg transition-all duration-300 ease-in-out shadow-lg shadow-[rgba(var(--color-accent-shadow),0.2)] hover:shadow-xl hover:shadow-[rgba(var(--color-accent-shadow),0.4)] hover:-translate-y-px active:scale-95 active:shadow-inner text-base"
                      disabled={isLoading}
                    >
                      <DownloadIcon className="w-5 h-5" />
                      Download
                    </button>
                    <div className="mt-2 flex items-center gap-2">
                          <input
                              type="checkbox"
                              id="upscale-checkbox-edit"
                              checked={shouldUpscale}
                              onChange={(e) => setShouldUpscale(e.target.checked)}
                              className="accent-checkbox w-4 h-4 rounded bg-[var(--color-base-300)] border-[var(--color-base-300)] focus:ring-[var(--color-accent-dark)] cursor-pointer"
                              disabled={isLoading}
                          />
                        <label htmlFor="upscale-checkbox-edit" className="text-[var(--color-muted-content)] text-sm font-medium cursor-pointer">
                            Upscale to 4K
                        </label>
                    </div>
                  </div>
              <div className="flex items-center gap-4">
                    <button 
                        onClick={handleUndo} 
                        disabled={!canUndo || isLoading}
                        className="flex items-center gap-2 text-[var(--color-muted-content)] hover:text-[var(--color-base-content)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed bg-[var(--color-base-content)]/10 p-3 rounded-lg"
                    >
                        <UndoIcon className="w-5 h-5" />
                    </button>
                    <button 
                        onClick={handleRedo}
                        disabled={!canRedo || isLoading}
                        className="flex items-center gap-2 text-[var(--color-muted-content)] hover:text-[var(--color-base-content)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed bg-[var(--color-base-content)]/10 p-3 rounded-lg"
                    >
                        <RedoIcon className="w-5 h-5" />
                    </button>
              </div>
                  <button 
                    onClick={handleReset} 
                    className="w-full sm:w-auto text-[var(--color-muted-content)] hover:text-[var(--color-base-content)] transition-colors py-2 px-4 rounded-lg hover:bg-[var(--color-base-content)]/10"
                    disabled={isLoading}
                  >
                    Start Over
                  </button>
             </div>
            </div>
            <div className="lg:col-span-2 w-full self-start">
               <div className="flex">
                  <TabButton tab="filter" label="Filters" icon={<FilterIcon className="w-4 h-4 sm:w-5 sm:h-5"/>} />
                  <TabButton tab="text" label="Text" icon={<TextIcon className="w-4 h-4 sm:w-5 sm:h-5"/>} />
                  <TabButton tab="background" label="Background" icon={<ImageIcon className="w-4 h-4 sm:w-5 sm:h-5"/>} />
                  <TabButton tab="auth" label="Auth Button" icon={<UserIcon className="w-4 h-4 sm:w-5 sm:h-5"/>} />
                </div>
                {activeEditorTab === 'filter' && (
                  <FilterPanel onApplyFilter={handleApplyFilter} isLoading={isLoading} />
                )}
                {activeEditorTab === 'text' && (
                  <TextEditorPanel textProps={textProps} setTextProps={setTextProps} isLoading={isLoading} />
                )}
                {activeEditorTab === 'background' && (
                  <BackgroundPanel 
                    onApplyBackground={handleChangeBackground} 
                    isLoading={isLoading}
                    onCustomBackgroundSelectForCrop={handleCustomBackgroundSelectForCrop}
                    onApplyCustomBackground={handleApplyCustomBackground}
                    customBgImageSrc={customBgImageSrc}
                    clearCustomBgImage={() => setCustomBgImageSrc(null)}
                  />
                )}
                {activeEditorTab === 'auth' && (
                  <AuthenticationPanel 
                    buttonProps={authButtonsProps} 
                    setButtonProps={setAuthButtonsProps} 
                    isLoading={isLoading} 
                  />
                )}
            </div>
          </div>
        );
      case 'options':
      default:
        return (
          <div className="grid grid-cols-1 md:grid-cols-5 gap-8 items-start animate-fade-in">
            <div className="md:col-span-3 flex flex-col items-center gap-4">
              <div className="w-full aspect-video bg-black/30 border border-[var(--color-base-300)] rounded-lg flex items-center justify-center p-1 relative">
                {croppedImage ? (
                  <img src={croppedImage} alt="Cropped preview" className="max-w-full max-h-full object-contain" />
                ) : (
                  <p className="text-[var(--color-muted-content)]">Crop an image to begin.</p>
                )}
                  <button
                      onClick={handleReset}
                      className="absolute top-3 right-3 z-10 p-2 bg-black/60 rounded-full text-[var(--color-base-content)] hover:bg-black/80 transition-colors"
                      aria-label="Start over"
                    >
                      <CrossIcon className="w-5 h-5" />
                    </button>
              </div>
              
              <div className="w-full">
                {error ? (
                    <div className="w-full aspect-video bg-[var(--color-error)]/80 rounded-lg flex flex-col items-center justify-center z-10 p-6 text-center animate-fade-in">
                        <h3 className="text-xl font-bold text-[var(--color-base-content)]">Generation Failed</h3>
                        <p className="mt-2 text-[var(--color-base-content)]/80">{error}</p>
                    </div>
                ) : (isLoading || generatedVariations.some(v => v !== null)) ? (
                  <div className={`grid ${numberOfVariations === 1 ? 'grid-cols-1' : 'grid-cols-1 lg:grid-cols-2'} gap-6`}>
                    {generatedVariations.slice(0, numberOfVariations).map((variationUrl, index) => (
                      variationUrl ? (
                        <div key={index} className="flex flex-col gap-4 items-center animate-fade-in">
                          <h3 className="text-xl font-bold text-[var(--color-base-content)]">Variation {String.fromCharCode(65 + index)}</h3>
                          <div className="w-full aspect-video bg-black/20 rounded-lg overflow-hidden border border-[var(--color-base-300)]">
                              <img src={variationUrl} alt={`Generated thumbnail variation ${String.fromCharCode(65 + index)}`} className="w-full h-full object-contain" />
                          </div>
                          <div className="w-full flex flex-col sm:flex-row items-center justify-center gap-3">
                              <div className="w-full sm:w-auto flex flex-col items-center">
                                    <button 
                                        onClick={() => handleInitialDownload(variationUrl)}
                                        className="w-full sm:w-auto flex items-center justify-center gap-3 bg-gradient-to-br from-[var(--color-accent-dark)] to-[var(--color-accent)] text-[var(--color-accent-content)] font-bold py-3 px-6 rounded-lg transition-all duration-300 ease-in-out shadow-lg shadow-[rgba(var(--color-accent-shadow),0.2)] hover:shadow-xl hover:shadow-[rgba(var(--color-accent-shadow),0.4)] hover:-translate-y-px active:scale-95 active:shadow-inner text-base"
                                    >
                                        <DownloadIcon className="w-5 h-5" />
                                        Download
                                    </button>
                                  <div className="mt-2 flex items-center gap-2">
                                        <input type="checkbox" id={`upscale-checkbox-${index}`} checked={shouldUpscale} onChange={(e) => setShouldUpscale(e.target.checked)} className="accent-checkbox w-4 h-4 rounded bg-[var(--color-base-300)] border-[var(--color-base-300)] focus:ring-[var(--color-accent-dark)] cursor-pointer" />
                                      <label htmlFor={`upscale-checkbox-${index}`} className="text-[var(--color-muted-content)] text-sm font-medium cursor-pointer">Upscale to 4K</label>
                                  </div>
                              </div>
                                <button
                                    onClick={() => handleSelectForEditing(variationUrl)}
                                    className="w-full sm:w-auto flex items-center justify-center gap-3 bg-[var(--color-base-content)]/10 border border-[var(--color-base-content)]/20 text-[var(--color-base-content)] font-semibold py-3 px-6 rounded-lg hover:bg-[var(--color-base-content)]/20 transition-colors"
                                >
                                    <MagicWandIcon className="w-5 h-5" />
                                    Advanced Edit
                                </button>
                          </div>
                        </div>
                      ) : (
                        <ThumbnailSkeleton key={`skeleton-${index}`} />
                      )
                    ))}
                  </div>
                ) : (
                  <div className="w-full aspect-video bg-black/30 border border-[var(--color-base-300)] rounded-lg flex items-center justify-center p-1 relative">
                    <div className="text-center text-[var(--color-muted-content)] p-4">
                        <MagicWandIcon className="w-8 h-8 sm:w-10 sm:h-10 mx-auto mb-2" />
                        <p className="font-semibold">Your A/B test variations will appear here.</p>
                        <p className="text-sm">Fill in the options and click "Generate".</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div className="md:col-span-2">
              <AdjustmentPanel
                category={category}
                setCategory={setCategory}
                emotion={emotion}
                setEmotion={setEmotion}
                emotionIntensity={emotionIntensity}
                setEmotionIntensity={setEmotionIntensity}
                difficulty={difficulty}
                setDifficulty={setDifficulty}
                title={title}
                setTitle={setTitle}
                textColor={textColor}
                setTextColor={setTextColor}
                fontStyle={fontStyle}
                setFontStyle={setFontStyle}
                backgroundStyle={backgroundStyle}
                setBackgroundStyle={setBackgroundStyle}
                outlineThickness={outlineThickness}
                setOutlineThickness={setOutlineThickness}
                outlineColor={outlineColor}
                setOutlineColor={setOutlineColor}
                customBackgroundPrompt={customBackgroundPrompt}
                setCustomBackgroundPrompt={setCustomBackgroundPrompt}
                onGenerate={handleGenerate}
                isLoading={isLoading}
                onSecondFileSelect={handleSecondFileSelect}
                croppedImage2={croppedImage2}
                numberOfVariations={numberOfVariations}
                setNumberOfVariations={setNumberOfVariations}
              />
            </div>
          </div>
        );
    }
  }
  
  const renderAppView = () => {
    if (error && (currentView !== 'login' && currentView !== 'signup' && currentView !== 'complete-profile')) {
        return (
            <div className="w-full max-w-2xl mx-auto my-10 text-center p-6 bg-[var(--color-error)]/20 border border-[var(--color-error)] rounded-lg">
                <h2 className="text-2xl font-bold text-[var(--color-base-content)]">An Error Occurred</h2>
                <p className="text-[var(--color-muted-content)] mt-2">{error}</p>
                 <button 
                    onClick={() => setError(null)} 
                    className="mt-4 text-[var(--color-muted-content)] hover:text-[var(--color-base-content)] transition-colors py-2 px-4 rounded-lg hover:bg-[var(--color-base-content)]/10"
                  >
                    Dismiss
                  </button>
            </div>
        );
    }

    switch(currentView) {
      case 'home':
        return <HomePage onGetStarted={() => setCurrentView('tool')} />;
      case 'login':
        return <LoginPage onNavigate={setCurrentView} onLoginSuccess={handleLoginSuccess} />;
      case 'signup':
        return <SignupPage onNavigate={setCurrentView} onSignupSuccess={handleSignupSuccess} />;
      case 'profile':
        return <Suspense fallback={<ProfilePageSkeleton />}><ProfilePage user={currentUser!} profile={userProfile!} onProfileUpdate={setUserProfile} onNavigate={setCurrentView} onSignOut={handleSignOut} /></Suspense>;
      case 'complete-profile':
        if (!currentUser) {
            setCurrentView('login');
            return null;
        }
        const handleProfileComplete = (newProfile: UserProfile) => {
            setUserProfile(newProfile);
            setCurrentView('profile');
        };
        return <CompleteProfilePage user={currentUser} onProfileComplete={handleProfileComplete} />;
      case 'contact':
        return <ContactPage />;
      case 'faq':
        return <FAQPage />;
      case 'features':
        return <FeaturesPage />;
      case 'about':
        return <AboutPage />;
      case 'blog':
        return <BlogPage />;
      case 'pricing':
        return <PricingPage onNavigate={setCurrentView} currentUser={currentUser} />;
      case 'terms-and-conditions':
        return <TermsAndConditionsPage />;
      case 'privacy-policy':
        return <PrivacyPolicyPage />;
      case 'refund-policy':
        return <RefundPolicyPage />;
      case 'tool':
      default:
        return renderToolContent();
    }
  }
  
  if (isAuthLoading) {
      return <AppSkeleton />;
  }

  return (
    <div className="min-h-screen bg-transparent text-[var(--color-base-content)] flex flex-col">
      <Header 
        currentUser={currentUser}
        userProfile={userProfile}
        onSignOut={handleSignOut}
        onNavigate={setCurrentView} 
      />
      <Suspense fallback={null}>
        <CategoryNav currentView={currentView} onNavigate={setCurrentView} />
      </Suspense>
      <main className="flex-grow container mx-auto p-4 sm:p-8">
        <Suspense fallback={<ContentSkeleton />}>
            {renderAppView()}
        </Suspense>
      </main>
      <Suspense fallback={null}>
        <Footer 
            onNavigate={setCurrentView}
        />
        {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
        <UpgradeModal isOpen={isUpgradeModalOpen} onClose={() => setIsUpgradeModalOpen(false)} onNavigate={setCurrentView} />
        {confirmation?.isOpen && (
            <ConfirmationModal
                isOpen={confirmation.isOpen}
                message={confirmation.message}
                onClose={() => setConfirmation(null)}
                onConfirm={() => {
                    if (confirmation.onConfirm) {
                        confirmation.onConfirm();
                    }
                    setConfirmation(null);
                }}
                secondaryAction={confirmation.secondaryAction}
            />
        )}
      </Suspense>
    </div>
  );
}

export default App;