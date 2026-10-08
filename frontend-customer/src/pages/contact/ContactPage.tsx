import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { 
  ChevronRight, 
  MapPin, 
  Phone, 
  Mail, 
  Clock, 
  Send, 
  MessageSquare, 
  CheckCircle2, 
  HeartHandshake 
} from 'lucide-react';
import toast from 'react-hot-toast';

import { apiClient, handleApiError } from '../../api/client';
import { useAuthStore } from '../../store/auth/useAuthStore';
import { useWebsiteStore } from '../../store/cms/useWebsiteStore';

export const ContactPage: React.FC = () => {
  const { user } = useAuthStore();
  const { cms } = useWebsiteStore();

  // Inquiry Form States
  const [name, setName] = useState(user?.name || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [email, setEmail] = useState(user?.email || '');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showMap, setShowMap] = useState(false);

  // Sync logged-in customer data if available on mount
  useEffect(() => {
    if (user) {
      setName(user.name);
      setPhone(user.phone);
      if (user.email) setEmail(user.email);
    }
  }, [user]);

  // Load Contact information dynamically from CMS
  const showroomAddress = cms?.footer?.address || 'Bogura, Bangladesh';
  const showroomPhone = cms?.site?.contactPhone || '+880 1780-xxxxxx';
  const supportEmail = cms?.footer?.email || 'support@newsingapurtele.com';
  const showroomHours = '10:00 AM - 10:00 PM (Everyday)';

  const handleInquirySubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Frontend validations
    if (!name.trim()) {
      toast.error('Please enter your name.');
      return;
    }
    if (!phone.trim()) {
      toast.error('Please enter a valid phone number.');
      return;
    }
    if (!subject.trim()) {
      toast.error('Please enter a subject.');
      return;
    }
    if (!message.trim()) {
      toast.error('Please enter your query message.');
      return;
    }

    try {
      setIsSubmitting(true);

      const payload = {
        name,
        phone,
        email: email || undefined,
        subject,
        message,
      };

      // Submit message directly to secure public message endpoint
      const response = await apiClient.post('/public/customer-messages', payload);
      
      if (response.data?.status) {
        toast.success('Your message has been sent successfully! Our team will contact you soon.');
        setSubject('');
        setMessage('');
      } else {
        throw new Error(response.data?.message || 'Failed to submit inquiry.');
      }

    } catch (err: any) {
      const parsedError = handleApiError(err);
      toast.error(parsedError.message || 'An error occurred. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="w-full bg-[#f8fafc] min-h-screen pb-16 text-left select-none">
      
      {/* Dynamic SEO metadata */}
      <Helmet>
        <title>Contact Us & Store Location | New Singapur Telecom</title>
        <meta name="description" content="Visit our premium showroom or submit your queries. Find customer care hotline, showroom location, business hours and support email of New Singapur Telecom." />
        <link rel="canonical" href={window.location.href} />
      </Helmet>

      {/* Breadcrumbs Row */}
      <div className="bg-white border-b border-gray-150 py-3.5 px-4 text-xs sm:text-sm font-semibold text-gray-500">
        <div className="max-w-7xl mx-auto flex items-center gap-1.5 justify-start text-left">
          <Link to="/" className="hover:text-[var(--nst-primary)]">Home</Link>
          <ChevronRight className="w-4 h-4 text-gray-300" />
          <span className="text-slate-800 font-extrabold">Contact Us</span>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 mt-8 grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* ==========================================
            Left Column: Contact Details & Embedded Map
            ========================================== */}
        <div className="flex flex-col gap-6">
          <div className="bg-white border border-gray-150 p-6 sm:p-8 rounded-3xl shadow-sm flex flex-col gap-5">
            <h2 className="text-slate-800 font-black text-lg sm:text-xl border-b border-gray-100 pb-3 flex items-center gap-2">
              <HeartHandshake className="w-5.5 h-5.5 text-[var(--nst-primary)]" />
              <span>Get in Touch</span>
            </h2>

            <ul className="flex flex-col gap-4 text-xs sm:text-sm font-medium text-slate-700">
              <li className="flex items-start gap-3">
                <MapPin className="w-5 h-5 text-[var(--nst-primary)] shrink-0 mt-0.5" />
                <div className="flex flex-col">
                  <span className="text-gray-400 text-[10px] font-bold uppercase tracking-wider">Showroom Address</span>
                  <span className="font-extrabold text-slate-800 mt-1 leading-snug">{showroomAddress}</span>
                </div>
              </li>
              <li className="flex items-center gap-3">
                <Phone className="w-5 h-5 text-[var(--nst-primary)] shrink-0" />
                <div className="flex flex-col">
                  <span className="text-gray-400 text-[10px] font-bold uppercase tracking-wider">Hotline</span>
                  <a href={`tel:${showroomPhone}`} className="font-extrabold text-slate-800 hover:text-[var(--nst-primary)] mt-1 transition-colors">{showroomPhone}</a>
                </div>
              </li>
              <li className="flex items-center gap-3">
                <Mail className="w-5 h-5 text-[var(--nst-primary)] shrink-0" />
                <div className="flex flex-col">
                  <span className="text-gray-400 text-[10px] font-bold uppercase tracking-wider">Support Email</span>
                  <a href={`mailto:${supportEmail}`} className="font-extrabold text-slate-800 hover:text-[var(--nst-primary)] mt-1 transition-colors truncate">{supportEmail}</a>
                </div>
              </li>
              <li className="flex items-center gap-3">
                <Clock className="w-5 h-5 text-[var(--nst-primary)] shrink-0" />
                <div className="flex flex-col">
                  <span className="text-gray-400 text-[10px] font-bold uppercase tracking-wider">Business Hours</span>
                  <span className="font-extrabold text-slate-800 mt-1">{showroomHours}</span>
                </div>
              </li>
            </ul>
          </div>

          {/* Embedded responsive Google Map of Bogura, Bangladesh */}
          <div className="w-full h-[250px] sm:h-[320px] rounded-3xl overflow-hidden border border-gray-150 shadow-inner">
            {showMap ? (
              <iframe
                title="New Singapur Telecom Showroom Google Map Location"
                src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3618.6657930198083!2d89.370503!3d24.847138!2m3!1f0!2m2!1f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x39fc545ef20a7b4f%3A0xe3282fc26c7e2f1!2sBogura!5e0!3m2!1sen!2sbd!4v1700000000000!5m2!1sen!2sbd"
                width="100%"
                height="100%"
                style={{ border: 0 }}
                allowFullScreen
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
              ></iframe>
            ) : (
              <button
                type="button"
                onClick={() => setShowMap(true)}
                className="flex h-full w-full flex-col items-center justify-center gap-3 bg-slate-50 text-slate-600 transition-colors hover:bg-slate-100"
              >
                <MapPin className="h-8 w-8 text-[var(--nst-primary)]" />
                <span className="text-sm font-extrabold">Load Google Map</span>
              </button>
            )}
          </div>
        </div>

        {/* ==========================================
            Right Column: Customer Query Inquiry Form
            ========================================== */}
        <div className="bg-white border border-gray-150 p-6 sm:p-8 rounded-3xl shadow-sm text-left flex flex-col gap-4">
          <h2 className="text-slate-800 font-black text-lg sm:text-xl border-b border-gray-100 pb-3 flex items-center gap-2">
            <MessageSquare className="w-5.5 h-5.5 text-[var(--nst-primary)]" />
            <span>Send Us a Message</span>
          </h2>
          <p className="text-gray-400 text-xs sm:text-sm font-semibold">Have any questions? Leave your query details here. Our representative will contact you shortly.</p>

          <form onSubmit={handleInquirySubmit} className="flex flex-col gap-4 mt-2">
            
            {/* Name */}
            <div className="flex flex-col gap-1.5">
              <span className="text-xs text-slate-800 font-bold uppercase tracking-wider">Your Name</span>
              <input type="text" required placeholder="Enter your full name" value={name} onChange={(e) => setName(e.target.value)} disabled={isSubmitting} className="border border-gray-200 rounded-xl px-4 h-11 bg-slate-50 focus:outline-none focus:border-[var(--nst-primary)] text-slate-800 text-sm placeholder-gray-400 disabled:opacity-50" />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Phone */}
              <div className="flex flex-col gap-1.5">
                <span className="text-xs text-slate-800 font-bold uppercase tracking-wider">Phone Number</span>
                <input type="tel" required placeholder="Enter contact phone" value={phone} onChange={(e) => setPhone(e.target.value)} disabled={isSubmitting} className="border border-gray-200 rounded-xl px-4 h-11 bg-slate-50 focus:outline-none focus:border-[var(--nst-primary)] text-slate-800 text-sm placeholder-gray-400 disabled:opacity-50" />
              </div>

              {/* Email */}
              <div className="flex flex-col gap-1.5">
                <span className="text-xs text-slate-800 font-bold uppercase tracking-wider">Email (Optional)</span>
                <input type="email" placeholder="Enter email address" value={email} onChange={(e) => setEmail(e.target.value)} disabled={isSubmitting} className="border border-gray-200 rounded-xl px-4 h-11 bg-slate-50 focus:outline-none focus:border-[var(--nst-primary)] text-slate-800 text-sm placeholder-gray-400 disabled:opacity-50" />
              </div>
            </div>

            {/* Subject */}
            <div className="flex flex-col gap-1.5">
              <span className="text-xs text-slate-800 font-bold uppercase tracking-wider">Subject</span>
              <input type="text" required placeholder="Enter inquiry subject" value={subject} onChange={(e) => setSubject(e.target.value)} disabled={isSubmitting} className="border border-gray-200 rounded-xl px-4 h-11 bg-slate-50 focus:outline-none focus:border-[var(--nst-primary)] text-slate-800 text-sm placeholder-gray-400 disabled:opacity-50" />
            </div>

            {/* Message */}
            <div className="flex flex-col gap-1.5">
              <span className="text-xs text-slate-800 font-bold uppercase tracking-wider">Query Message</span>
              <textarea required rows={4} placeholder="Type your query message here..." value={message} onChange={(e) => setMessage(e.target.value)} disabled={isSubmitting} className="border border-gray-200 rounded-xl p-4 bg-slate-50 focus:outline-none focus:border-[var(--nst-primary)] text-slate-800 text-sm placeholder-gray-400 disabled:opacity-50 resize-none" />
            </div>

            {/* Submit inquiry */}
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full bg-[var(--nst-primary)] hover:bg-purple-600 disabled:bg-purple-300 text-white font-black text-xs sm:text-sm py-3.5 rounded-xl flex items-center justify-center gap-1.5 transition-all shadow-md cursor-pointer mt-2 disabled:cursor-not-allowed"
            >
              <span>{isSubmitting ? 'Sending inquiry...' : 'Send Message'}</span>
              <Send className="w-4.5 h-4.5" />
            </button>

            {/* Verified secure ticket details */}
            <div className="flex items-center justify-center gap-1.5 text-[9px] text-gray-400 font-bold uppercase tracking-wider mt-1 select-none">
              <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
              <span>Verified customer message support ticket handshake secure</span>
            </div>

          </form>
        </div>

      </div>
    </div>
  );
};

export default ContactPage;